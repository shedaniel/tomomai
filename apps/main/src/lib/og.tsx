import { ImageResponse } from "next/og";
import path from "path";
import { readFile } from "fs/promises";
import sharp from "sharp";
import type { Locale } from "@/i18n/locale";
import { getRatingImageUrl } from "@/lib/rating-calculator";
import type { VersionId } from "@/lib/metadata";
import { renderLevelPrecise } from "@/lib/name-utils";
import type { Difficulty, Region } from "@/lib/types";

export const OG_SIZE = { width: 1200, height: 630 };

// Pre-compute grid path: vertical + horizontal lines every 40px
const gridPath = [
  ...Array.from({ length: 31 }, (_, i) => `M ${i * 40} 0 L ${i * 40} 630`),
  ...Array.from({ length: 17 }, (_, i) => `M 0 ${i * 40} L 1200 ${i * 40}`),
].join(" ");

type Weight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
type FontEntry = { name: string; data: ArrayBuffer; style: "normal"; weight: Weight };

const FONT_DIR = path.join(process.cwd(), "public", "res", "fonts", "og");

const fontCache = new Map<string, Promise<ArrayBuffer>>();
function loadTtf(file: string): Promise<ArrayBuffer> {
  let p = fontCache.get(file);
  if (!p) {
    p = readFile(path.join(FONT_DIR, file)).then((buf) =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    );
    fontCache.set(file, p);
  }
  return p;
}

async function loadInterFonts(): Promise<FontEntry[]> {
  const [regular, semiBold, bold] = await Promise.all([
    loadTtf("Inter-400.ttf"),
    loadTtf("Inter-600.ttf"),
    loadTtf("Inter-700.ttf"),
  ]);
  return [
    { name: "Inter", data: regular, style: "normal" as const, weight: 400 as Weight },
    { name: "Inter", data: semiBold, style: "normal" as const, weight: 600 as Weight },
    { name: "Inter", data: bold, style: "normal" as const, weight: 700 as Weight },
  ];
}

async function loadGeistMono(): Promise<FontEntry[]> {
  const regular = await loadTtf("GeistMono-400.ttf");
  return [
    { name: "Geist Mono", data: regular, style: "normal" as const, weight: 400 as Weight },
  ];
}

async function loadLocaleFonts(locale: Locale): Promise<FontEntry[]> {
  // Mirror the logic from src/app/layout.tsx
  const needsJP = true; // NotoSansJP covers ja + ko + fallback
  const needsTC = locale === "zh-TW" || locale === "zh-HK";
  const needsSC = locale === "zh-CN" || locale === "zh-SG";

  const loads: Promise<FontEntry[]>[] = [];

  if (needsJP) {
    loads.push(
      Promise.all([loadTtf("NotoSansJP-600.ttf"), loadTtf("NotoSansJP-700.ttf")])
        .then(([semiBold, bold]) => [
          { name: "Noto Sans JP", data: semiBold, style: "normal" as const, weight: 600 as Weight },
          { name: "Noto Sans JP", data: bold, style: "normal" as const, weight: 700 as Weight },
        ]),
    );
  }

  if (needsTC) {
    loads.push(
      Promise.all([loadTtf("NotoSansTC-600.ttf"), loadTtf("NotoSansTC-700.ttf")])
        .then(([semiBold, bold]) => [
          { name: "Noto Sans TC", data: semiBold, style: "normal" as const, weight: 600 as Weight },
          { name: "Noto Sans TC", data: bold, style: "normal" as const, weight: 700 as Weight },
        ]),
    );
  }

  if (needsSC) {
    loads.push(
      Promise.all([loadTtf("NotoSansSC-600.ttf"), loadTtf("NotoSansSC-700.ttf")])
        .then(([semiBold, bold]) => [
          { name: "Noto Sans SC", data: semiBold, style: "normal" as const, weight: 600 as Weight },
          { name: "Noto Sans SC", data: bold, style: "normal" as const, weight: 700 as Weight },
        ]),
    );
  }

  return (await Promise.all(loads)).flat();
}

/** Returns the CSS font-family stack for a given locale, matching layout.tsx */
function getFontFamily(locale: Locale): string {
  switch (locale) {
    case "zh-TW":
    case "zh-HK":
      return "Inter, Noto Sans TC, Noto Sans JP";
    case "zh-CN":
    case "zh-SG":
      return "Inter, Noto Sans SC, Noto Sans JP";
    default:
      return "Inter, Noto Sans JP";
  }
}

type LoadedImage = { dataUrl: string; width: number; height: number };

async function loadLocalImage(file: string, height: number): Promise<LoadedImage> {
  const filePath = path.join(process.cwd(), "public", file);
  const meta = await sharp(filePath).metadata();
  const width = meta.width && meta.height
    ? Math.round((meta.width / meta.height) * height)
    : height;
  const png = await sharp(filePath).resize(width, height).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${png.toString("base64")}`, width, height };
}

const remoteBufferCache = new Map<string, Promise<Buffer | null>>();
function fetchImageBuffer(url: string): Promise<Buffer | null> {
  let p = remoteBufferCache.get(url);
  if (!p) {
    p = (async () => {
      try {
        if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
        return Buffer.from(await (await fetch(url)).arrayBuffer());
      } catch {
        return null;
      }
    })();
    remoteBufferCache.set(url, p);
  }
  return p;
}

async function loadRemoteImage(url: string, height: number, width?: number): Promise<LoadedImage | null> {
  try {
    if (url.startsWith("data:")) {
      // Already a data URL — pass through, but trust the caller's dimensions.
      return { dataUrl: url, width: width ?? height, height };
    }
    const buf = await fetchImageBuffer(url);
    if (!buf) return null;
    const meta = await sharp(buf).metadata();
    const w = width ?? (meta.width && meta.height
      ? Math.round((meta.width / meta.height) * height)
      : height);
    const png = await sharp(buf).resize(w, height, { fit: "cover" }).png().toBuffer();
    return { dataUrl: `data:image/png;base64,${png.toString("base64")}`, width: w, height };
  } catch {
    return null;
  }
}

type Pixel = [number, number, number];

function rgb([r, g, b]: Pixel): string {
  const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function saturationOf([r, g, b]: Pixel): number {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function luminanceOf([r, g, b]: Pixel): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Boost saturation toward a vibrant baseline so background-tinted glows stay readable. */
function boostVibrance(p: Pixel, minSat = 0.55): Pixel {
  const max = Math.max(p[0], p[1], p[2]);
  const min = Math.min(p[0], p[1], p[2]);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (sat >= minSat) return p;
  // Pull each channel away from the gray midpoint by `1 + boost`.
  const mid = (max + min) / 2;
  const factor = sat === 0 ? 1.5 : Math.min(2, minSat / Math.max(0.05, sat));
  return [
    mid + (p[0] - mid) * factor,
    mid + (p[1] - mid) * factor,
    mid + (p[2] - mid) * factor,
  ] as Pixel;
}

async function pixelsFrom(buf: Buffer, size = 24): Promise<Pixel[]> {
  const { data } = await sharp(buf)
    .resize(size, size, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels: Pixel[] = [];
  for (let i = 0; i < data.length; i += 3) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  return pixels;
}

function vibrantPixels(pixels: Pixel[]): Pixel[] {
  const filtered = pixels.filter((p) => {
    const lum = luminanceOf(p);
    return lum > 25 && lum < 235 && saturationOf(p) > 0.25;
  });
  return filtered.length >= Math.max(8, Math.floor(pixels.length * 0.05)) ? filtered : pixels;
}

function avgPixel(pixels: Pixel[]): Pixel {
  const sum = pixels.reduce(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]] as Pixel,
    [0, 0, 0] as Pixel,
  );
  return [sum[0] / pixels.length, sum[1] / pixels.length, sum[2] / pixels.length] as Pixel;
}

/** Extract one dominant color from a remote image, or null if it can't be loaded. */
async function extractDominantColor(url: string): Promise<string | null> {
  const buf = await fetchImageBuffer(url);
  if (!buf) return null;
  try {
    const usable = vibrantPixels(await pixelsFrom(buf, 24));
    // Pick the most-saturated bright pixel — gives a punchier accent than mean.
    let best: Pixel = usable[0];
    let bestScore = -Infinity;
    for (const p of usable) {
      const score = saturationOf(p) * 1.5 + (luminanceOf(p) / 255) * 0.5;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return rgb(boostVibrance(best));
  } catch {
    return null;
  }
}

/** Extract two distinct colors from a remote image (k-means with k=2). */
async function extractTwoColors(url: string): Promise<[string, string] | null> {
  const buf = await fetchImageBuffer(url);
  if (!buf) return null;
  try {
    const usable = vibrantPixels(await pixelsFrom(buf, 28));

    // Initialize centroids with the most-distant pair we can find.
    let c1: Pixel = usable[0];
    let c2: Pixel = usable[usable.length - 1];
    let maxD = -1;
    for (let i = 0; i < usable.length; i++) {
      for (let j = i + 1; j < usable.length; j++) {
        const a = usable[i], b = usable[j];
        const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
        if (d > maxD) { maxD = d; c1 = a; c2 = b; }
      }
    }

    for (let iter = 0; iter < 6; iter++) {
      const g1: Pixel[] = [], g2: Pixel[] = [];
      for (const p of usable) {
        const d1 = (p[0] - c1[0]) ** 2 + (p[1] - c1[1]) ** 2 + (p[2] - c1[2]) ** 2;
        const d2 = (p[0] - c2[0]) ** 2 + (p[1] - c2[1]) ** 2 + (p[2] - c2[2]) ** 2;
        (d1 < d2 ? g1 : g2).push(p);
      }
      if (g1.length) c1 = avgPixel(g1);
      if (g2.length) c2 = avgPixel(g2);
    }

    // Brighter / more saturated centroid first for a consistent primary slot.
    const score = (p: Pixel) => saturationOf(p) * 1.5 + (luminanceOf(p) / 255) * 0.5;
    const ordered: [Pixel, Pixel] = score(c1) >= score(c2) ? [c1, c2] : [c2, c1];
    return [rgb(boostVibrance(ordered[0])), rgb(boostVibrance(ordered[1]))];
  } catch {
    return null;
  }
}

export type Accent = { primary: string; secondary: string };

/** Default accent (the original purple/cyan brand pair). */
export const DEFAULT_ACCENT: Accent = { primary: "#8b5cf6", secondary: "#06b6d4" };

/** Aqua + warm orange — used by the database section. */
export const DB_ACCENT: Accent = { primary: "#06b6d4", secondary: "#f97316" };

/** Dim a hex color to an `rgba(...)` string at a given alpha [0..1]. */
function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m || m.length < 3) return hex;
  const [r, g, b] = m.map((h) => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function PrimaryGlow({ color }: { color: string }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "-160px",
        right: "-120px",
        width: "600px",
        height: "600px",
        borderRadius: "9999px",
        background: `radial-gradient(circle, ${hexToRgba(color, 0.35)} 0%, transparent 70%)`,
        display: "flex",
      }}
    />
  );
}

function SecondaryGlow({ color }: { color: string }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "-140px",
        left: "-100px",
        width: "520px",
        height: "520px",
        borderRadius: "9999px",
        background: `radial-gradient(circle, ${hexToRgba(color, 0.28)} 0%, transparent 70%)`,
        display: "flex",
      }}
    />
  );
}

function GridBackground() {
  return (
    <svg style={{ position: "absolute", inset: "0" }} width="1200" height="630">
      <path d={gridPath} stroke="rgba(255,255,255,0.04)" strokeWidth="1" fill="none" />
    </svg>
  );
}

function BrandChip({ section, icon }: { section?: string; icon: LoadedImage }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ color: "#fafafa", fontSize: "20px", fontWeight: 700 }}>tomomai.lol</span>
        {section && (
          <span style={{ color: "#a1a1aa", fontSize: "20px", fontWeight: 400 }}>· {section}</span>
        )}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon.dataUrl} width={icon.width} height={icon.height} alt="tomomai icon" />
    </div>
  );
}

export type OGImageOptions = {
  /** Subtitle shown next to "tomomai ·" in the top bar */
  section: string;
  title: string;
  summary?: string;
  /** Optional bottom label (e.g. a date string) */
  label?: string;
  locale?: Locale;
  accent?: Accent;
};

export async function createOGImage(options: OGImageOptions) {
  const { section, title, summary, label, locale = "en", accent = DEFAULT_ACCENT } = options;

  const [interFonts, localeFonts, icon] = await Promise.all([
    loadInterFonts(),
    loadLocaleFonts(locale),
    loadLocalImage("icon-dark.webp", 48),
  ]);

  const fonts = [...interFonts, ...localeFonts];
  const fontFamily = getFontFamily(locale);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#09090b",
          fontFamily,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <GridBackground />
        <PrimaryGlow color={accent.primary} />
        <SecondaryGlow color={accent.secondary} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            padding: "56px 64px",
            position: "relative",
          }}
        >
          <BrandChip section={section} icon={icon} />

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div
              style={{
                color: "#fafafa",
                fontSize: "56px",
                fontWeight: 700,
                lineHeight: 1.1,
                maxWidth: "950px",
              }}
            >
              {title}
            </div>
            {summary && (
              <div
                style={{
                  color: "#a1a1aa",
                  fontSize: "22px",
                  fontWeight: 600,
                  lineHeight: 1.5,
                  maxWidth: "800px",
                }}
              >
                {summary.length > 200 ? summary.slice(0, 200) + "…" : summary}
              </div>
            )}
          </div>

          {label && (
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div
                style={{
                  width: "36px",
                  height: "3px",
                  borderRadius: "9999px",
                  background: "rgba(255, 255, 255, 0.18)",
                  display: "flex",
                }}
              />
              <span style={{ color: "#a1a1aa", fontSize: "18px", fontWeight: 600 }}>{label}</span>
            </div>
          )}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}

export type HomeOGImageOptions = {
  tagline: string;
  locale?: Locale;
  /** public/-relative path to the logo image. Defaults to the tomomai mark. */
  logoFile?: string;
  /** Logo render height in px. */
  logoHeight?: number;
  accent?: Accent;
};

export async function createHomeOGImage(options: HomeOGImageOptions) {
  const {
    tagline,
    locale = "en",
    logoFile = "icon-dark.webp",
    logoHeight = 240,
    accent = DEFAULT_ACCENT,
  } = options;

  const [interFonts, localeFonts, logo] = await Promise.all([
    loadInterFonts(),
    loadLocaleFonts(locale),
    loadLocalImage(logoFile, logoHeight),
  ]);

  const fonts = [...interFonts, ...localeFonts];
  const fontFamily = getFontFamily(locale);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#09090b",
          fontFamily,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <GridBackground />
        <PrimaryGlow color={accent.primary} />
        <SecondaryGlow color={accent.secondary} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "32px",
            width: "100%",
            padding: "72px 80px",
            position: "relative",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo.dataUrl} width={logo.width} height={logo.height} alt="tomomai" />

          <div
            style={{
              width: "96px",
              height: "4px",
              borderRadius: "9999px",
              background: "rgba(255, 255, 255, 0.18)",
              display: "flex",
            }}
          />

          <div
            style={{
              color: "#e4e4e7",
              fontSize: "36px",
              fontWeight: 600,
              lineHeight: 1.3,
              textAlign: "center",
              maxWidth: "960px",
            }}
          >
            {tagline}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}

export type ProfileOGImageOptions = {
  /** maimai display name shown in the rating plate area */
  displayName: string;
  /** account/handle title shown above the display name (small badge) */
  title?: string;
  /** username on the URL — shown as @handle */
  username: string;
  /** localized region label, e.g. "International" or "Japan" */
  regionLabel: string;
  /** raw region key, used to color the chip */
  region: Region;
  rating: number;
  gameVersion?: VersionId;
  /** optional remote icon URL (http(s) only — data URLs are skipped) */
  iconUrl?: string | null;
  locale?: Locale;
};

export async function createProfileOGImage(options: ProfileOGImageOptions) {
  const {
    displayName,
    title,
    username,
    regionLabel,
    region,
    rating,
    gameVersion,
    iconUrl,
    locale = "en",
  } = options;

  // Build absolute URL for the rating plate (sharp can read public/ directly)
  const ratingPath = getRatingImageUrl(rating, gameVersion).replace(/^\//, "");

  const isHttpIcon = !!iconUrl && (iconUrl.startsWith("http://") || iconUrl.startsWith("https://"));

  const [interFonts, monoFonts, localeFonts, brandIcon, ratingPlate, userIcon, extracted] = await Promise.all([
    loadInterFonts(),
    loadGeistMono(),
    loadLocaleFonts(locale),
    loadLocalImage("icon-dark.webp", 48),
    loadLocalImage(ratingPath, 90),
    isHttpIcon ? loadRemoteImage(iconUrl!, 220, 220) : Promise.resolve(null),
    isHttpIcon ? extractTwoColors(iconUrl!) : Promise.resolve(null),
  ]);

  // Profile accent: two colors extracted from the user icon (with brand fallback).
  const accent: Accent = extracted
    ? { primary: extracted[0], secondary: extracted[1] }
    : DEFAULT_ACCENT;

  const fonts = [...interFonts, ...monoFonts, ...localeFonts];
  const fontFamily = getFontFamily(locale);

  const regionAccent = region === "jp" ? "#f43f5e" : "#06b6d4";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#09090b",
          fontFamily,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <GridBackground />
        <PrimaryGlow color={accent.primary} />
        <SecondaryGlow color={accent.secondary} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            padding: "56px 64px",
            position: "relative",
          }}
        >
          <BrandChip section="profile" icon={brandIcon} />

          {/* Middle: avatar + name stack + rating plate */}
          <div style={{ display: "flex", alignItems: "center", gap: "40px" }}>
            {/* Avatar tile */}
            <div
              style={{
                width: 240,
                height: 240,
                borderRadius: "28px",
                background: `linear-gradient(135deg, ${hexToRgba(accent.primary, 0.55)}, ${hexToRgba(accent.secondary, 0.45)})`,
                padding: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 224,
                  height: 224,
                  borderRadius: "22px",
                  overflow: "hidden",
                  background: "#18181b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {userIcon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={userIcon.dataUrl}
                    width={userIcon.width}
                    height={userIcon.height}
                    alt={displayName}
                  />
                ) : (
                  <span style={{ color: "#71717a", fontSize: "120px", fontWeight: 700 }}>
                    {displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px", minWidth: 0, flex: 1 }}>
              {/* Region chip + handle */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "6px 14px",
                    borderRadius: "9999px",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "9999px",
                      background: regionAccent,
                    }}
                  />
                  <span style={{ color: "#e4e4e7", fontSize: "20px", fontWeight: 600 }}>
                    {regionLabel}
                  </span>
                </div>
                <span style={{ color: "#71717a", fontSize: "20px", fontWeight: 600 }}>
                  @{username}
                </span>
              </div>

              {/* Title chip (in-game title) */}
              {title && (
                <div
                  style={{
                    alignSelf: "flex-start",
                    color: "#a1a1aa",
                    fontSize: "22px",
                    fontWeight: 600,
                    padding: "6px 18px",
                    borderRadius: "9999px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    maxWidth: "780px",
                    lineHeight: 1.2,
                  }}
                >
                  {title}
                </div>
              )}

              {/* Display name */}
              <div
                style={{
                  color: "#fafafa",
                  fontSize: "60px",
                  fontWeight: 700,
                  padding: "10px 0px",
                  lineHeight: 1.05,
                }}
              >
                {displayName}
              </div>

              {/* Rating plate with overlaid number, mirroring InfoCard */}
              <div
                style={{
                  position: "relative",
                  width: ratingPlate.width,
                  height: ratingPlate.height,
                  display: "flex",
                  marginTop: "4px",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ratingPlate.dataUrl}
                  width={ratingPlate.width}
                  height={ratingPlate.height}
                  alt={`rating ${rating}`}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 19,
                    left: 19,
                    width: ratingPlate.width - 35,
                    height: 54,
                    color: "white",
                    fontSize: "46px",
                    fontWeight: 400,
                    fontFamily: "Geist Mono",
                    letterSpacing: "4px",
                    textAlign: "right",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                  }}
                >
                  {rating}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom accent bar */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "36px",
                height: "3px",
                borderRadius: "9999px",
                background: "rgba(255, 255, 255, 0.18)",
                display: "flex",
              }}
            />
            <span style={{ color: "#a1a1aa", fontSize: "18px", fontWeight: 600 }}>
              tomomai.lol/profile/{username}
            </span>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}

const DIFFICULTY_HEX: Record<string, string> = {
  basic: "#10b981",
  advanced: "#f59e0b",
  expert: "#f43f5e",
  master: "#8b5cf6",
  remaster: "#d8b4fe",
  utage: "#ec4899",
};

const DIFFICULTY_LABEL: Record<string, string> = {
  basic: "BAS",
  advanced: "ADV",
  expert: "EXP",
  master: "MAS",
  remaster: "ReM",
  utage: "宴",
};

export type SongOGImageOptions = {
  songName: string;
  artist: string;
  /** Resolved cover URL — http(s) only; falls back to placeholder if null/blocked. */
  coverUrl: string;
  /** "dx" | "std" | "utage" */
  songType: string;
  genre: string;
  /** Pretty version name e.g. "PRiSM PLUS" */
  versionName?: string;
  difficulties: { difficulty: Difficulty; levelPrecise: number }[];
  locale?: Locale;
};

export async function createSongOGImage(options: SongOGImageOptions) {
  const {
    songName,
    artist,
    coverUrl,
    songType,
    genre,
    versionName,
    difficulties,
    locale = "en",
  } = options;

  const orderedDiffs = [...difficulties].sort((a, b) => {
    const order = ["basic", "advanced", "expert", "master", "remaster", "utage"];
    return order.indexOf(a.difficulty) - order.indexOf(b.difficulty);
  });

  const [interFonts, monoFonts, localeFonts, brandIcon, cover, extracted] = await Promise.all([
    loadInterFonts(),
    loadGeistMono(),
    loadLocaleFonts(locale),
    loadLocalImage("icon-db-dark.webp", 48),
    loadRemoteImage(coverUrl, 460, 460),
    extractTwoColors(coverUrl),
  ]);

  const fonts = [...interFonts, ...monoFonts, ...localeFonts];
  const fontFamily = getFontFamily(locale);

  const isDx = songType === "dx";
  const isUtage = songType === "utage";
  const typeAccent = isUtage ? "#ec4899" : isDx ? "#f59e0b" : "#06b6d4";
  const typeLabel = isUtage ? "宴会場" : isDx ? "でらっくす" : "スタンダード";

  // Accent: two colors extracted from the cover (with DB defaults as fallback).
  const accent: Accent = extracted
    ? { primary: extracted[0], secondary: extracted[1] }
    : DB_ACCENT;
  const coverGlow = accent.primary;

  // Heuristically scale the song title down for very long names
  const titleSize = songName.length > 28 ? 48 : songName.length > 18 ? 60 : 72;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#09090b",
          fontFamily,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <GridBackground />
        <PrimaryGlow color={accent.primary} />
        <SecondaryGlow color={accent.secondary} />

        {/* Diffuse glow behind cover, tinted by top difficulty */}
        <div
          style={{
            position: "absolute",
            top: "85px",
            left: "0px",
            width: "560px",
            height: "560px",
            borderRadius: "9999px",
            background: `radial-gradient(circle, ${coverGlow}55 0%, transparent 65%)`,
            display: "flex",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            padding: "56px 64px",
            position: "relative",
          }}
        >
          <BrandChip section="songs" icon={brandIcon} />

          {/* Middle: cover + info */}
          <div style={{ display: "flex", alignItems: "center", gap: "56px" }}>
            {/* Cover tile */}
            <div
              style={{
                width: 380,
                height: 380,
                borderRadius: "28px",
                background: `linear-gradient(135deg, ${coverGlow}66, rgba(255,255,255,0.05))`,
                padding: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: `0 30px 80px ${coverGlow}40`,
              }}
            >
              <div
                style={{
                  width: 364,
                  height: 364,
                  borderRadius: "22px",
                  overflow: "hidden",
                  background: "#18181b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover.dataUrl}
                    width={cover.width}
                    height={cover.height}
                    alt={songName}
                  />
                ) : (
                  <span style={{ color: "#52525b", fontSize: "180px", fontWeight: 700 }}>♪</span>
                )}
              </div>
            </div>

            {/* Info column */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0, flex: 1 }}>
              {/* Type + version chips */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "6px 14px",
                    borderRadius: "9999px",
                    background: `${typeAccent}22`,
                    border: `1px solid ${typeAccent}66`,
                    color: typeAccent,
                    fontSize: "20px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                  }}
                >
                  {typeLabel}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "6px 14px",
                    borderRadius: "9999px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#d4d4d8",
                    fontSize: "20px",
                    fontWeight: 600,
                  }}
                >
                  {genre}
                </div>
                {versionName && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "6px 14px",
                      borderRadius: "9999px",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#a1a1aa",
                      fontSize: "20px",
                      fontWeight: 600,
                    }}
                  >
                    {versionName}
                  </div>
                )}
              </div>

              {/* Song title */}
              <div
                style={{
                  color: "#fafafa",
                  fontSize: `${titleSize}px`,
                  fontWeight: 700,
                  lineHeight: 1.05,
                  letterSpacing: "-0.01em",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {songName}
              </div>

              {/* Artist */}
              <div
                style={{
                  color: "#a1a1aa",
                  fontSize: "26px",
                  fontWeight: 600,
                  lineHeight: 1.2,
                  display: "-webkit-box",
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {artist}
              </div>

              {/* Difficulty chips */}
              {orderedDiffs.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
                  {orderedDiffs.map((d) => {
                    const color = DIFFICULTY_HEX[d.difficulty] ?? "#71717a";
                    return (
                      <div
                        key={d.difficulty}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "8px 14px",
                          borderRadius: "20px",
                          background: `${color}1f`,
                          border: `1px solid ${color}66`,
                        }}
                      >
                        <span style={{ color, fontSize: "18px", fontWeight: 700, letterSpacing: "0.04em" }}>
                          {DIFFICULTY_LABEL[d.difficulty] ?? d.difficulty.toUpperCase()}
                        </span>
                        <span style={{ color: "#fafafa", fontSize: "26px", fontWeight: 700, fontFamily: "Geist Mono" }}>
                          {renderLevelPrecise(d.levelPrecise, d.difficulty)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Bottom accent bar */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "36px",
                height: "3px",
                borderRadius: "9999px",
                background: "rgba(255, 255, 255, 0.18)",
                display: "flex",
              }}
            />
            <span style={{ color: "#a1a1aa", fontSize: "18px", fontWeight: 600 }}>
              tomomai.lol/db/songs
            </span>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
