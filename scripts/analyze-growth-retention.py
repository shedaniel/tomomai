#!/usr/bin/env -S uv run --with psycopg2-binary --with python-dotenv --with tabulate --with cryptography --with scipy --with ua-parser python
"""User growth & retention analysis, segmented by rating band.

Run: ./scripts/analyze-growth-retention.py
Reads POSTGRES_URL_PROD from .env.local.
"""
import os
import sys
from pathlib import Path

from collections import Counter, defaultdict
from datetime import datetime, timezone

from dotenv import load_dotenv
import psycopg2
from tabulate import tabulate
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from scipy.stats import chi2_contingency
from ua_parser import user_agent_parser

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

DSN = os.environ.get("POSTGRES_URL_PROD")
if not DSN:
    sys.exit("POSTGRES_URL_PROD not set in .env.local")

# Rating bands. Each entry: (label, lo_inclusive, hi_exclusive). hi=None => +inf.
BANDS = [
    ("a: <7k",         0,     7000),
    ("b: 7k-10k",      7000,  10000),
    ("c: 10k-11k",     10000, 11000),
    ("d: 11k-12k",     11000, 12000),
    ("e: 12k-13k",     12000, 13000),
    ("f: 13k-14k",     13000, 14000),
    ("g: 14k-14.5k",   14000, 14500),
    ("h: 14.5k-15k",   14500, 15000),
    ("i: 15k-15.5k",   15000, 15500),
    ("j: 15.5k-16k",   15500, 16000),
    ("k: 16k+",        16000, None),
]

def band_case_sql(col: str) -> str:
    parts = ["CASE"]
    for label, lo, hi in BANDS:
        cond = f"{col} >= {lo}" + (f" AND {col} < {hi}" if hi is not None else "")
        parts.append(f"  WHEN {cond} THEN '{label}'")
    parts.append("END")
    return "\n".join(parts)

TOKEN_PREFIXES = ("cookie://", "account://", "lxns://", "cn-cookies://", "divingfish://")

def classify_token(plain: str) -> str:
    for p in TOKEN_PREFIXES:
        if plain.startswith(p):
            return p[:-3]  # strip "://"
    return "raw"

def load_user_token_methods(cur) -> dict:
    """Decrypt user_tokens and return userId -> primary method label.
    Mirrors src/lib/token-crypto.ts (AES-256-GCM, iv:authTag:encryptedData hex).
    """
    secret = os.environ.get("TOKEN_SECRET")
    if not secret or len(secret) != 64:
        print("(skipping token-method analysis: TOKEN_SECRET not set or wrong length)")
        return {}
    aes = AESGCM(bytes.fromhex(secret))

    cur.execute('SELECT "userId", token FROM user_tokens')
    user_methods: dict[str, set[str]] = defaultdict(set)
    errors = 0
    for uid, ct in cur.fetchall():
        try:
            iv_h, tag_h, data_h = ct.split(":")
            plain = aes.decrypt(bytes.fromhex(iv_h),
                                bytes.fromhex(data_h) + bytes.fromhex(tag_h),
                                None).decode()
            user_methods[uid].add(classify_token(plain))
        except Exception:
            errors += 1
    if errors:
        print(f"(decrypt errors: {errors})")

    # Collapse to a single label per user
    out = {}
    for uid, methods in user_methods.items():
        out[uid] = next(iter(methods)) if len(methods) == 1 else "multi"
    return out

def classify_device(ua_str: str) -> str:
    p = user_agent_parser.Parse(ua_str or "")
    fam = (p["os"]["family"] or "").lower()
    if "ios" in fam: return "ios"
    if "android" in fam: return "android"
    if "windows" in fam: return "windows"
    if "mac os" in fam: return "mac"
    if "linux" in fam or "ubuntu" in fam or "fedora" in fam: return "linux"
    if "chrome os" in fam: return "chromeos"
    return "other"

def device_pref(devices: set[str]) -> str:
    mobile = bool(devices & {"ios", "android"})
    desktop = bool(devices & {"windows", "mac", "linux", "chromeos"})
    if mobile and desktop: return "both"
    if mobile: return "mobile_only"
    if desktop: return "desktop_only"
    return "other"

def parse_browser(ua_str: str) -> str:
    return user_agent_parser.Parse(ua_str or "")["user_agent"]["family"] or "Unknown"

def section(title: str):
    print()
    print("=" * 78)
    print(title)
    print("=" * 78)

def main():
    conn = psycopg2.connect(DSN)
    cur = conn.cursor()

    # ---- Overall counts ----
    section("Overall counts")
    cur.execute("""
        SELECT
          (SELECT COUNT(*) FROM "user")                                  AS total_users,
          (SELECT COUNT(DISTINCT "userId") FROM user_snapshots)          AS users_with_snapshot,
          (SELECT COUNT(*) FROM user_snapshots)                          AS total_snapshots,
          (SELECT MIN("fetchedAt") FROM user_snapshots)                  AS earliest,
          (SELECT MAX("fetchedAt") FROM user_snapshots)                  AS latest
    """)
    row = cur.fetchone()
    print(tabulate([row], headers=["total_users", "users_with_snapshot", "total_snapshots", "earliest", "latest"]))

    # ---- Weekly registrations ----
    section("Weekly registrations (last 20 weeks)")
    cur.execute("""
        SELECT date_trunc('week', "createdAt") AS week,
               COUNT(*) AS new_users,
               COUNT(*) FILTER (
                 WHERE EXISTS (SELECT 1 FROM user_snapshots s WHERE s."userId" = "user".id)
               ) AS new_users_with_snapshot
        FROM "user"
        WHERE "createdAt" > NOW() - INTERVAL '20 weeks'
        GROUP BY 1 ORDER BY 1
    """)
    print(tabulate(cur.fetchall(), headers=["week", "new_users", "with_snapshot"]))

    # ---- First-snapshot inflow ----
    section("Weekly first-snapshot users (registered users with usage)")
    cur.execute("""
        WITH first_snap AS (
          SELECT "userId", MIN("fetchedAt") AS first_at FROM user_snapshots GROUP BY "userId"
        )
        SELECT date_trunc('week', first_at) AS week, COUNT(*) AS first_time_users
        FROM first_snap
        WHERE first_at > NOW() - INTERVAL '24 weeks'
        GROUP BY 1 ORDER BY 1
    """)
    print(tabulate(cur.fetchall(), headers=["week", "first_time_users"]))

    # ---- Weekly snapshot activity ----
    section("Weekly snapshot activity (last 24 weeks)")
    cur.execute("""
        SELECT date_trunc('week', "fetchedAt") AS week,
               COUNT(*) AS snapshots,
               COUNT(DISTINCT "userId") AS active_users,
               ROUND((COUNT(*)::numeric / NULLIF(COUNT(DISTINCT "userId"), 0)), 2) AS snaps_per_user
        FROM user_snapshots
        WHERE "fetchedAt" > NOW() - INTERVAL '24 weeks'
        GROUP BY 1 ORDER BY 1
    """)
    print(tabulate(cur.fetchall(),
                   headers=["week", "snapshots", "active_users", "snaps/user"]))

    # ---- Weekly snapshot activity by rating band (last 12 weeks) ----
    section("Weekly active users by rating band (last 12 weeks)")
    cur.execute(f"""
        WITH last_rating AS (
          SELECT DISTINCT ON ("userId") "userId", rating
          FROM user_snapshots ORDER BY "userId", "fetchedAt" DESC
        )
        SELECT date_trunc('week', s."fetchedAt") AS week,
               {band_case_sql('l.rating')} AS band,
               COUNT(DISTINCT s."userId") AS active_users,
               COUNT(*) AS snapshots
        FROM user_snapshots s JOIN last_rating l USING("userId")
        WHERE s."fetchedAt" > NOW() - INTERVAL '12 weeks'
        GROUP BY 1, 2 ORDER BY 1, 2
    """)
    rows = cur.fetchall()
    weeks = sorted({r[0] for r in rows})
    bands = [b[0] for b in BANDS]
    pivot_users = {(w, b): 0 for w in weeks for b in bands}
    pivot_snaps = {(w, b): 0 for w in weeks for b in bands}
    for w, b, u, s in rows:
        pivot_users[(w, b)] = u
        pivot_snaps[(w, b)] = s
    out = [[w.date()] + [pivot_users[(w, b)] for b in bands] for w in weeks]
    print("Active users (DAU-equivalent) by week × band:")
    print(tabulate(out, headers=["week"] + [b.split(":")[0] for b in bands]))
    print()
    out = [[w.date()] + [pivot_snaps[(w, b)] for b in bands] for w in weeks]
    print("Snapshots by week × band:")
    print(tabulate(out, headers=["week"] + [b.split(":")[0] for b in bands]))

    # ---- Snapshot frequency / cadence per active user ----
    section("Snapshot cadence (median days between consecutive snapshots, by current band)")
    cur.execute(f"""
        WITH last_rating AS (
          SELECT DISTINCT ON ("userId") "userId", rating
          FROM user_snapshots ORDER BY "userId", "fetchedAt" DESC
        ),
        gaps AS (
          SELECT s."userId",
                 {band_case_sql('l.rating')} AS band,
                 EXTRACT(EPOCH FROM (s."fetchedAt" - LAG(s."fetchedAt") OVER (PARTITION BY s."userId" ORDER BY s."fetchedAt"))) / 86400 AS gap_days
          FROM user_snapshots s JOIN last_rating l USING("userId")
        )
        SELECT band,
               COUNT(*) FILTER (WHERE gap_days IS NOT NULL) AS gap_count,
               ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_days)::numeric, 2) AS p50_days,
               ROUND(percentile_cont(0.9) WITHIN GROUP (ORDER BY gap_days)::numeric, 2) AS p90_days,
               ROUND(AVG(gap_days)::numeric, 2) AS mean_days
        FROM gaps WHERE gap_days IS NOT NULL
        GROUP BY band ORDER BY band
    """)
    print(tabulate(cur.fetchall(),
                   headers=["band", "gaps", "median_days", "p90_days", "mean_days"]))

    # ---- Daily snapshots, last 30 days ----
    section("Daily snapshot volume (last 30 days)")
    cur.execute("""
        SELECT date_trunc('day', "fetchedAt")::date AS day,
               COUNT(*) AS snapshots,
               COUNT(DISTINCT "userId") AS active_users
        FROM user_snapshots
        WHERE "fetchedAt" > NOW() - INTERVAL '30 days'
        GROUP BY 1 ORDER BY 1
    """)
    print(tabulate(cur.fetchall(), headers=["day", "snapshots", "active_users"]))

    # ---- Rating distribution by band ----
    section("Rating distribution (latest snapshot per user)")
    cur.execute(f"""
        WITH latest AS (
          SELECT DISTINCT ON ("userId") "userId", rating
          FROM user_snapshots
          ORDER BY "userId", "fetchedAt" DESC
        )
        SELECT {band_case_sql('rating')} AS band,
               COUNT(*) AS users,
               ROUND(AVG(rating)) AS avg_rating,
               MIN(rating) AS min_r,
               MAX(rating) AS max_r
        FROM latest
        GROUP BY 1
        ORDER BY 1
    """)
    rows = cur.fetchall()
    total = sum(r[1] for r in rows)
    out = [[b, u, f"{100*u/total:.1f}%", a, mn, mx] for b, u, a, mn, mx in rows]
    print(tabulate(out, headers=["band", "users", "share", "avg", "min", "max"]))

    # ---- Cohort retention (week-of-first-snapshot) ----
    section("Retention by cohort week (% active in week +1, +2, +4, +8)")
    cur.execute("""
        WITH first_snap AS (
          SELECT "userId", MIN("fetchedAt") AS first_at FROM user_snapshots GROUP BY "userId"
        ),
        cohorts AS (
          SELECT "userId", date_trunc('week', first_at) AS cohort_week FROM first_snap
        ),
        weekly_activity AS (
          SELECT DISTINCT "userId", date_trunc('week', "fetchedAt") AS active_week FROM user_snapshots
        )
        SELECT c.cohort_week,
          COUNT(DISTINCT c."userId") AS cohort_size,
          COUNT(DISTINCT CASE WHEN w.active_week = c.cohort_week + INTERVAL '1 week' THEN c."userId" END) AS w1,
          COUNT(DISTINCT CASE WHEN w.active_week = c.cohort_week + INTERVAL '2 week' THEN c."userId" END) AS w2,
          COUNT(DISTINCT CASE WHEN w.active_week = c.cohort_week + INTERVAL '4 week' THEN c."userId" END) AS w4,
          COUNT(DISTINCT CASE WHEN w.active_week = c.cohort_week + INTERVAL '8 week' THEN c."userId" END) AS w8
        FROM cohorts c
        LEFT JOIN weekly_activity w ON w."userId" = c."userId"
        WHERE c.cohort_week >= '2025-11-01'
          AND c.cohort_week < date_trunc('week', NOW()) - INTERVAL '1 week'
        GROUP BY c.cohort_week
        ORDER BY c.cohort_week
    """)
    rows = cur.fetchall()
    out = []
    for cw, size, w1, w2, w4, w8 in rows:
        fmt = lambda x: f"{x} ({100*x/size:.0f}%)" if size else "0"
        out.append([cw.date(), size, fmt(w1), fmt(w2), fmt(w4), fmt(w8)])
    print(tabulate(out, headers=["cohort_week", "size", "+1w", "+2w", "+4w", "+8w"]))

    # ---- Retention by current rating band ----
    section("Retention by rating band (users whose first snapshot was >= 4 weeks ago)")
    cur.execute(f"""
        WITH first_snap AS (
          SELECT "userId", MIN("fetchedAt") AS first_at FROM user_snapshots GROUP BY "userId"
        ),
        last_rating AS (
          SELECT DISTINCT ON ("userId") "userId", rating, "fetchedAt" AS last_at
          FROM user_snapshots ORDER BY "userId", "fetchedAt" DESC
        ),
        joined AS (
          SELECT f."userId", f.first_at, l.rating, l.last_at,
                 {band_case_sql('l.rating')} AS band
          FROM first_snap f JOIN last_rating l USING("userId")
          WHERE f.first_at < NOW() - INTERVAL '4 weeks'
        )
        SELECT band,
               COUNT(*) AS users,
               COUNT(*) FILTER (WHERE last_at > NOW() - INTERVAL '7 days')  AS a7,
               COUNT(*) FILTER (WHERE last_at > NOW() - INTERVAL '14 days') AS a14,
               COUNT(*) FILTER (WHERE last_at > NOW() - INTERVAL '30 days') AS a30,
               ROUND(AVG(rating)) AS avg_rating
        FROM joined GROUP BY band ORDER BY band
    """)
    rows = cur.fetchall()
    out = []
    for band, users, a7, a14, a30, avgr in rows:
        pct = lambda x: f"{x} ({100*x/users:.0f}%)" if users else "0"
        out.append([band, users, pct(a7), pct(a14), pct(a30), avgr])
    print(tabulate(out, headers=["band", "users", "active 7d", "active 14d", "active 30d", "avg_rating"]))

    # ---- Engagement intensity by band ----
    section("Engagement intensity by rating band (all-time per-user averages)")
    cur.execute(f"""
        WITH last_rating AS (
          SELECT DISTINCT ON ("userId") "userId", rating
          FROM user_snapshots ORDER BY "userId", "fetchedAt" DESC
        ),
        per_user AS (
          SELECT s."userId",
            {band_case_sql('l.rating')} AS band,
            COUNT(*) AS n_snaps,
            COUNT(DISTINCT date_trunc('week', "fetchedAt")) AS n_weeks,
            EXTRACT(EPOCH FROM (MAX("fetchedAt") - MIN("fetchedAt")))/86400 AS span_days
          FROM user_snapshots s JOIN last_rating l USING("userId")
          GROUP BY 1, 2
        )
        SELECT band,
               COUNT(*) AS users,
               ROUND(AVG(n_snaps)::numeric, 1) AS avg_snaps,
               ROUND(AVG(n_weeks)::numeric, 1) AS avg_weeks_active,
               ROUND(AVG(span_days)::numeric, 1) AS avg_span_days
        FROM per_user GROUP BY band ORDER BY band
    """)
    print(tabulate(cur.fetchall(),
                   headers=["band", "users", "avg_snaps", "avg_weeks_active", "avg_span_days"]))

    # ---- Rating progression by band ----
    section("Rating progression first->last (users with span >= 14 days)")
    cur.execute(f"""
        WITH bounds AS (
          SELECT "userId",
            (array_agg(rating      ORDER BY "fetchedAt" ASC ))[1] AS first_r,
            (array_agg(rating      ORDER BY "fetchedAt" DESC))[1] AS last_r,
            EXTRACT(EPOCH FROM (MAX("fetchedAt") - MIN("fetchedAt")))/86400 AS span_days
          FROM user_snapshots GROUP BY "userId"
        )
        SELECT {band_case_sql('last_r')} AS band,
               COUNT(*) AS users,
               ROUND(AVG(last_r - first_r)) AS avg_delta,
               ROUND(AVG((last_r - first_r) / NULLIF(span_days, 0) * 30)::numeric, 1) AS avg_per_30d
        FROM bounds WHERE span_days >= 14
        GROUP BY band ORDER BY band
    """)
    print(tabulate(cur.fetchall(),
                   headers=["band", "users", "avg_delta", "rating_per_30d"]))

    # ---- Retention by token auth method ----
    section("Retention by token auth method (users with first snapshot >= 4 weeks ago)")
    user_method = load_user_token_methods(cur)
    if user_method:
        cur.execute("""
            WITH first_snap AS (
              SELECT "userId", MIN("fetchedAt") AS first_at FROM user_snapshots GROUP BY "userId"
            ),
            last_snap AS (
              SELECT "userId", MAX("fetchedAt") AS last_at, COUNT(*) AS n FROM user_snapshots GROUP BY "userId"
            )
            SELECT f."userId", f.first_at, l.last_at, l.n
            FROM first_snap f JOIN last_snap l USING("userId")
            WHERE f.first_at < NOW() - INTERVAL '4 weeks'
        """)
        now = datetime.now()
        buckets: dict[str, dict] = defaultdict(lambda: {"users":0,"a7":0,"a14":0,"a30":0,"snaps":0,"avg_first_age":0.0})
        for uid, first_at, last_at, n in cur.fetchall():
            method = user_method.get(uid, "no_token")
            b = buckets[method]
            b["users"] += 1
            b["snaps"] += n
            b["avg_first_age"] += (now - first_at).days
            ds = (now - last_at).days
            if ds <= 7:  b["a7"]  += 1
            if ds <= 14: b["a14"] += 1
            if ds <= 30: b["a30"] += 1

        out = []
        for method, b in sorted(buckets.items(), key=lambda x: -x[1]["users"]):
            u = b["users"]
            if u < 5: continue
            pct = lambda x: f"{x} ({100*x/u:.0f}%)"
            out.append([method, u, pct(b["a7"]), pct(b["a14"]), pct(b["a30"]),
                        round(b["snaps"]/u, 1), round(b["avg_first_age"]/u, 1)])
        print(tabulate(out, headers=["method","users","7d","14d","30d","avg_snaps","avg_user_age_days"]))

        # Chi-square test for retention vs method (account:// vs cookie:// only)
        a, c = buckets.get("account"), buckets.get("cookie")
        if a and c and a["users"] >= 30 and c["users"] >= 30:
            print("\nStatistical test: account:// vs cookie:// retention")
            for label, key in [("7-day", "a7"), ("14-day", "a14"), ("30-day", "a30")]:
                table = [[a[key], a["users"]-a[key]],
                         [c[key], c["users"]-c[key]]]
                chi2, p, dof, _ = chi2_contingency(table)
                sig = "***" if p < 0.001 else ("**" if p < 0.01 else ("*" if p < 0.05 else "ns"))
                print(f"  {label:7s}  chi2={chi2:6.3f}  p={p:.6f}  {sig}")

        # ---- Token method × rating band ----
        section("Token method distribution by rating band")
        cur.execute("""
            SELECT DISTINCT ON ("userId") "userId", rating
            FROM user_snapshots ORDER BY "userId", "fetchedAt" DESC
        """)
        latest_rating = dict(cur.fetchall())
        method_band = Counter()
        for uid, method in user_method.items():
            r = latest_rating.get(uid)
            if r is None: continue
            band = next((label for label, lo, hi in BANDS if r >= lo and (hi is None or r < hi)), "?")
            method_band[(band, method)] += 1
        all_methods = sorted({m for _, m in method_band})
        rows = []
        for label, _, _ in BANDS:
            row = [label] + [method_band.get((label, m), 0) for m in all_methods]
            if sum(row[1:]) > 0:
                rows.append(row)
        print(tabulate(rows, headers=["band"] + all_methods))

    # ---- Retention by primary region ----
    section("Retention by primary region (region of user's most recent snapshot)")
    cur.execute("""
        WITH latest AS (
          SELECT DISTINCT ON ("userId") "userId", region AS primary_region
          FROM user_snapshots ORDER BY "userId", "fetchedAt" DESC
        ),
        fl AS (
          SELECT "userId", MIN("fetchedAt") f, MAX("fetchedAt") l, COUNT(*) n
          FROM user_snapshots GROUP BY 1
        )
        SELECT pr.primary_region,
          COUNT(*) AS users,
          COUNT(*) FILTER (WHERE l > NOW() - INTERVAL '7 days') a7,
          COUNT(*) FILTER (WHERE l > NOW() - INTERVAL '14 days') a14,
          COUNT(*) FILTER (WHERE l > NOW() - INTERVAL '30 days') a30,
          ROUND(AVG(n)::numeric, 1) AS avg_snaps
        FROM fl JOIN latest pr USING("userId")
        WHERE f < NOW() - INTERVAL '28 days'
        GROUP BY 1 ORDER BY 2 DESC
    """)
    out = []
    for region, u, a7, a14, a30, avg in cur.fetchall():
        pct = lambda x: f"{x} ({100*x/u:.0f}%)"
        out.append([region, u, pct(a7), pct(a14), pct(a30), avg])
    print(tabulate(out, headers=["region","users","7d","14d","30d","avg_snaps"]))

    # ---- Retention by number of configured regions ----
    section("Retention by number of regions configured (user_tokens distinct regions)")
    cur.execute("""
        WITH region_count AS (
          SELECT "userId", COUNT(DISTINCT region) AS n_regions FROM user_tokens GROUP BY 1
        ),
        fl AS (
          SELECT "userId", MIN("fetchedAt") f, MAX("fetchedAt") l, COUNT(*) n
          FROM user_snapshots GROUP BY 1
        )
        SELECT
          COALESCE(rc.n_regions, 0) AS n_regions,
          COUNT(*) users,
          COUNT(*) FILTER (WHERE l > NOW() - INTERVAL '7 days') a7,
          COUNT(*) FILTER (WHERE l > NOW() - INTERVAL '14 days') a14,
          COUNT(*) FILTER (WHERE l > NOW() - INTERVAL '30 days') a30,
          ROUND(AVG(n)::numeric, 1) avg_snaps
        FROM fl LEFT JOIN region_count rc USING("userId")
        WHERE f < NOW() - INTERVAL '28 days'
        GROUP BY 1 ORDER BY 1
    """)
    rows = cur.fetchall()
    out = []
    for n, u, a7, a14, a30, avg in rows:
        pct = lambda x: f"{x} ({100*x/u:.0f}%)"
        out.append([n, u, pct(a7), pct(a14), pct(a30), avg])
    print(tabulate(out, headers=["n_regions","users","7d","14d","30d","avg_snaps"]))
    by_n = {r[0]: (r[1], r[4]) for r in rows}
    if 1 in by_n and any(k >= 2 for k in by_n):
        one_u, one_30 = by_n[1]
        multi_u = sum(by_n[k][0] for k in by_n if k >= 2)
        multi_30 = sum(by_n[k][1] for k in by_n if k >= 2)
        chi2, p, _, _ = chi2_contingency([[one_30, one_u-one_30],[multi_30, multi_u-multi_30]])
        sig = "***" if p<0.001 else "**" if p<0.01 else "*" if p<0.05 else "ns"
        print(f"\n  1-region vs 2+ region (30d): chi2={chi2:.3f}, p={p:.6f} {sig}")

    # ---- Retention by publishProfile ----
    section("Retention by publishProfile setting")
    cur.execute("""
        WITH fl AS (
          SELECT "userId", MIN("fetchedAt") f, MAX("fetchedAt") l, COUNT(*) n
          FROM user_snapshots GROUP BY 1
        )
        SELECT u."publishProfile",
          COUNT(*) users,
          COUNT(*) FILTER (WHERE fl.l > NOW() - INTERVAL '7 days') a7,
          COUNT(*) FILTER (WHERE fl.l > NOW() - INTERVAL '14 days') a14,
          COUNT(*) FILTER (WHERE fl.l > NOW() - INTERVAL '30 days') a30,
          ROUND(AVG(fl.n)::numeric, 1) avg_snaps
        FROM "user" u JOIN fl ON fl."userId" = u.id
        WHERE fl.f < NOW() - INTERVAL '28 days'
        GROUP BY 1 ORDER BY 1
    """)
    rows = cur.fetchall()
    out = []
    for v, u, a7, a14, a30, avg in rows:
        pct = lambda x: f"{x} ({100*x/u:.0f}%)"
        out.append([v, u, pct(a7), pct(a14), pct(a30), avg])
    print(tabulate(out, headers=["publishProfile","users","7d","14d","30d","avg_snaps"]))
    d = {r[0]: (r[1], r[4]) for r in rows}
    if True in d and False in d:
        chi2, p, _, _ = chi2_contingency(
            [[d[True][1], d[True][0]-d[True][1]],
             [d[False][1], d[False][0]-d[False][1]]])
        sig = "***" if p<0.001 else "**" if p<0.01 else "*" if p<0.05 else "ns"
        print(f"\n  publishProfile=true vs false (30d): chi2={chi2:.3f}, p={p:.6f} {sig}")

    # ---- Retention by time-to-first-snapshot ----
    section("Retention by time-to-first-snapshot (activation speed)")
    cur.execute("""
        WITH fs AS (
          SELECT "userId", MIN("fetchedAt") f, MAX("fetchedAt") l, COUNT(*) n
          FROM user_snapshots GROUP BY 1
        )
        SELECT
          CASE
            WHEN EXTRACT(EPOCH FROM (fs.f - u."createdAt"))/60 < 5 THEN 'a: <5 min'
            WHEN EXTRACT(EPOCH FROM (fs.f - u."createdAt"))/60 < 30 THEN 'b: 5-30 min'
            WHEN EXTRACT(EPOCH FROM (fs.f - u."createdAt"))/3600 < 2 THEN 'c: 30 min - 2 hr'
            WHEN EXTRACT(EPOCH FROM (fs.f - u."createdAt"))/3600 < 24 THEN 'd: 2-24 hr'
            WHEN EXTRACT(EPOCH FROM (fs.f - u."createdAt"))/86400 < 7 THEN 'e: 1-7 days'
            ELSE 'f: 7+ days'
          END AS activation,
          COUNT(*) users,
          COUNT(*) FILTER (WHERE fs.l > NOW() - INTERVAL '7 days') a7,
          COUNT(*) FILTER (WHERE fs.l > NOW() - INTERVAL '14 days') a14,
          COUNT(*) FILTER (WHERE fs.l > NOW() - INTERVAL '30 days') a30,
          ROUND(AVG(fs.n)::numeric, 1) avg_snaps
        FROM "user" u JOIN fs ON fs."userId" = u.id
        WHERE fs.f < NOW() - INTERVAL '28 days' AND fs.f >= u."createdAt"
        GROUP BY 1 ORDER BY 1
    """)
    out = []
    for bucket, u, a7, a14, a30, avg in cur.fetchall():
        pct = lambda x: f"{x} ({100*x/u:.0f}%)"
        out.append([bucket, u, pct(a7), pct(a14), pct(a30), avg])
    print(tabulate(out, headers=["activation","users","7d","14d","30d","avg_snaps"]))

    # ---- User-Agent / device signals ----
    section("Device class & browser signals (from session.userAgent)")
    cur.execute("""
        SELECT s."userId", s."userAgent",
               (SELECT MAX("fetchedAt") FROM user_snapshots WHERE "userId"=s."userId"),
               (SELECT MIN("fetchedAt") FROM user_snapshots WHERE "userId"=s."userId"),
               (SELECT COUNT(*)         FROM user_snapshots WHERE "userId"=s."userId")
        FROM session s
        WHERE s."userAgent" IS NOT NULL
        ORDER BY s."userId", s."createdAt" DESC
    """)
    user_sessions: dict[str, list[str]] = defaultdict(list)
    user_last: dict[str, datetime] = {}
    user_first: dict[str, datetime] = {}
    user_n: dict[str, int] = {}
    for uid, ua, last, first, n in cur.fetchall():
        user_sessions[uid].append(ua)
        if uid not in user_first and first is not None:
            user_first[uid] = first
            user_last[uid] = last
            user_n[uid] = n

    now = datetime.now()
    def eligible(uid):
        return uid in user_first and (now - user_first[uid]).days >= 28

    def bucket_row(buckets, key, uid):
        b = buckets[key]
        b["n"] += 1
        b["snaps"] += user_n[uid]
        days_since = (now - user_last[uid]).days
        if days_since <= 7:  b["a7"]  += 1
        if days_since <= 14: b["a14"] += 1
        if days_since <= 30: b["a30"] += 1

    def fmt_table(buckets, ordered_keys=None):
        keys = ordered_keys or sorted(buckets, key=lambda k: -buckets[k]["n"])
        rows = []
        for k in keys:
            b = buckets[k]
            n = b["n"]
            if n < 5: continue
            pct = lambda x: f"{x} ({100*x/n:.0f}%)"
            rows.append([k, n, pct(b["a7"]), pct(b["a14"]), pct(b["a30"]),
                         round(b["snaps"]/n, 1)])
        return rows

    new_bucket = lambda: {"n":0,"a7":0,"a14":0,"a30":0,"snaps":0}

    # By latest-session device
    by_device = defaultdict(new_bucket)
    by_pref   = defaultdict(new_bucket)
    by_browser = defaultdict(new_bucket)
    by_n_devices = defaultdict(new_bucket)
    for uid, sessions in user_sessions.items():
        if not eligible(uid): continue
        devices = [classify_device(ua) for ua in sessions]
        bucket_row(by_device, devices[0], uid)  # latest session
        bucket_row(by_pref, device_pref(set(devices)), uid)
        bucket_row(by_browser, parse_browser(sessions[0]), uid)
        bucket_row(by_n_devices, len(set(devices)), uid)

    print("Retention by latest-session device class:")
    print(tabulate(fmt_table(by_device),
                   headers=["device","users","7d","14d","30d","avg_snaps"]))

    print("\nRetention by mobile/desktop preference (across all sessions):")
    print(tabulate(fmt_table(by_pref, ordered_keys=["both","mobile_only","desktop_only","other"]),
                   headers=["pref","users","7d","14d","30d","avg_snaps"]))
    keys = ["mobile_only","desktop_only","both"]
    table = [[by_pref[k]["a30"], by_pref[k]["n"]-by_pref[k]["a30"]]
             for k in keys if by_pref[k]["n"] > 0]
    if len(table) >= 2:
        chi2, p, dof, _ = chi2_contingency(table)
        sig = "***" if p<0.001 else "**" if p<0.01 else "*" if p<0.05 else "ns"
        print(f"\n  mobile_only vs desktop_only vs both (30d): chi2={chi2:.3f}, dof={dof}, p={p:.6f} {sig}")

    print("\nRetention by primary browser (latest session):")
    print(tabulate(fmt_table(by_browser),
                   headers=["browser","users","7d","14d","30d","avg_snaps"]))

    print("\nRetention by number of distinct device classes used:")
    print(tabulate(fmt_table(by_n_devices, ordered_keys=sorted(by_n_devices)),
                   headers=["n_devices","users","7d","14d","30d","avg_snaps"]))
    if 1 in by_n_devices:
        single = by_n_devices[1]
        multi_n = sum(by_n_devices[k]["n"]   for k in by_n_devices if k >= 2)
        multi_a = sum(by_n_devices[k]["a30"] for k in by_n_devices if k >= 2)
        if multi_n:
            chi2, p, dof, _ = chi2_contingency(
                [[single["a30"], single["n"]-single["a30"]],
                 [multi_a, multi_n-multi_a]])
            sig = "***" if p<0.001 else "**" if p<0.01 else "*" if p<0.05 else "ns"
            print(f"\n  1-device vs 2+ device (30d): chi2={chi2:.3f}, p={p:.6f} {sig}")

    # ---- Fetch failures: prevalence and retention impact ----
    section("Fetch failures: prevalence (last 90 days)")
    cur.execute("""
        SELECT "errorMessage", COUNT(*) AS n,
               COUNT(DISTINCT "userId") AS distinct_users
        FROM fetch_sessions
        WHERE status='failed' AND "startedAt" > NOW() - INTERVAL '90 days'
        GROUP BY 1 ORDER BY n DESC LIMIT 12
    """)
    print(tabulate(cur.fetchall(), headers=["errorMessage","occurrences","distinct_users"]))

    failure_modes = {
        "token_expired":   "\"errorMessage\" = 'Token has expired. Please provide a new token.'",
        "rate_limit":      "(\"errorMessage\" = 'Could not find .see_through_block in player data' OR \"errorMessage\" LIKE 'Player page did not contain expected profile content%')",
        "maint_window":    "\"errorMessage\" = 'Cannot fetch data during maintenance window (4AM - 7AM JST)'",
        "login_no_cookie": "\"errorMessage\" IN ('Login successful but no authentication cookie received.','Login successful but could not extract authentication cookie.')",
        "creds_bad":       "\"errorMessage\" = 'Login failed. Please check your username and password.'",
        "timeout":         "\"errorMessage\" IN ('Fetch timed out after 3 minutes','Fetch operation timed out after 2 minutes')",
    }

    section("Recovery rate after first failure (users with first error >= 14 days ago)")
    print("Note: hitting an error usually CORRELATES with high retention because")
    print("active users are the ones generating fetches. Recovery rate is the")
    print("more meaningful signal: did the user fetch successfully again after?\n")
    rec_rows = []
    for label, where in failure_modes.items():
        cur.execute(f"""
            WITH first_err AS (
              SELECT "userId", MIN("startedAt") AS t
              FROM fetch_sessions
              WHERE status='failed' AND {where}
              GROUP BY "userId"
              HAVING MIN("startedAt") < NOW() - INTERVAL '14 days'
            ),
            rec AS (
              SELECT fe."userId",
                EXISTS (SELECT 1 FROM fetch_sessions f
                        WHERE f."userId"=fe."userId" AND f.status='completed'
                          AND f."startedAt" > fe.t) AS recovered,
                EXISTS (SELECT 1 FROM fetch_sessions f
                        WHERE f."userId"=fe."userId" AND f.status='completed'
                          AND f."startedAt" > fe.t + INTERVAL '7 days') AS recovered_7d_later
              FROM first_err fe
            )
            SELECT COUNT(*),
                   COUNT(*) FILTER (WHERE recovered),
                   COUNT(*) FILTER (WHERE recovered_7d_later)
            FROM rec
        """)
        n, ret, ret7 = cur.fetchone()
        pct = lambda x: f"{x} ({100*x/n:.0f}%)" if n else "-"
        rec_rows.append([label, n, pct(ret), pct(ret7)])
    print(tabulate(rec_rows, headers=["error","#users","recovered_ever","still_fetching_>7d_later"]))

    section("Hit-rate vs 30d retention (selection-biased — active users hit errors more)")
    rows = []
    for label, where in failure_modes.items():
        cur.execute(f"""
            WITH eligible AS (
              SELECT "userId", MAX("fetchedAt") AS last_at FROM user_snapshots
              GROUP BY "userId" HAVING MIN("fetchedAt") < NOW() - INTERVAL '28 days'
            ),
            hit AS (SELECT DISTINCT "userId" FROM fetch_sessions WHERE status='failed' AND {where})
            SELECT
              COUNT(*) FILTER (WHERE h."userId" IS NOT NULL) AS aff,
              COUNT(*) FILTER (WHERE h."userId" IS NULL)     AS unaff,
              COUNT(*) FILTER (WHERE h."userId" IS NOT NULL AND e.last_at > NOW() - INTERVAL '30 days') AS aff30,
              COUNT(*) FILTER (WHERE h."userId" IS NULL     AND e.last_at > NOW() - INTERVAL '30 days') AS unaff30
            FROM eligible e LEFT JOIN hit h USING("userId")
        """)
        aff, unaff, aff30, unaff30 = cur.fetchone()
        pct = lambda n,d: f"{100*n/d:.0f}%" if d else "-"
        chi2, p, _, _ = chi2_contingency([[aff30, aff-aff30], [unaff30, unaff-unaff30]])
        sig = "***" if p < 0.001 else ("**" if p < 0.01 else ("*" if p < 0.05 else "ns"))
        rows.append([label, aff, pct(aff30, aff), unaff, pct(unaff30, unaff), f"{p:.5f} {sig}"])
    print(tabulate(rows, headers=["error","#hit","hit_30d","#nohit","nohit_30d","p_value"]))

    section("Token_expired recovery & retention by token auth method")
    if user_method:
        cur.execute("""
            WITH first_err AS (
              SELECT "userId", MIN("startedAt") AS t FROM fetch_sessions
              WHERE status='failed'
                AND "errorMessage" = 'Token has expired. Please provide a new token.'
              GROUP BY "userId"
              HAVING MIN("startedAt") < NOW() - INTERVAL '14 days'
            ),
            rec AS (
              SELECT fe."userId",
                EXISTS (SELECT 1 FROM fetch_sessions f
                        WHERE f."userId"=fe."userId" AND f.status='completed'
                          AND f."startedAt" > fe.t) AS recovered,
                (SELECT MAX("fetchedAt") FROM user_snapshots s
                 WHERE s."userId"=fe."userId") AS last_snap
              FROM first_err fe
            )
            SELECT "userId", recovered, last_snap FROM rec
        """)
        now = datetime.now()
        agg = defaultdict(lambda: {"n":0,"rec":0,"a30":0})
        for uid, recovered, last_snap in cur.fetchall():
            m = user_method.get(uid, "no_token")
            agg[m]["n"] += 1
            if recovered: agg[m]["rec"] += 1
            if last_snap and (now - last_snap).days <= 30:
                agg[m]["a30"] += 1
        out = []
        for m, d in sorted(agg.items(), key=lambda x: -x[1]["n"]):
            n = d["n"]
            if n < 5: continue
            out.append([m, n,
                        f"{d['rec']} ({100*d['rec']/n:.0f}%)",
                        f"{d['a30']} ({100*d['a30']/n:.0f}%)"])
        print(tabulate(out, headers=["method","users_hit","recovered_ever","still_active_30d"]))

    section("Repeated token_expired hits per user")
    cur.execute("""
        SELECT n_errors, COUNT(*) AS users FROM (
          SELECT "userId", COUNT(*) AS n_errors FROM fetch_sessions
          WHERE status='failed'
            AND "errorMessage" = 'Token has expired. Please provide a new token.'
          GROUP BY 1
        ) t GROUP BY 1 ORDER BY 1
    """)
    print(tabulate(cur.fetchall(), headers=["#token_expired_errors","users"]))

    conn.close()

if __name__ == "__main__":
    main()
