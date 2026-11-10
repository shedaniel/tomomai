import { NATIVE_CALLBACK_PATH } from "@/lib/oauth-native";

/**
 * Read from `APPLE_APP_IDS` (comma-separated, each `<team id>.<bundle id>`), `ANDROID_APP_PACKAGE` and
 * `ANDROID_APP_SHA256_FINGERPRINTS` (comma-separated, each colon-separated hex bytes).
 */
type AppLinkEnv = Readonly<Record<string, string | undefined>>;

const APPLE_APP_ID = /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/;
const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function list(value: string | undefined): string[] {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

/** The file iOS fetches to learn which app may open the callback link. Null while no app is configured. */
export function appleAppSiteAssociation(env: AppLinkEnv = process.env) {
  const appIDs = list(env.APPLE_APP_IDS).filter((id) => APPLE_APP_ID.test(id));
  if (appIDs.length === 0) return null;
  return {
    applinks: { details: [{ appIDs, components: [{ "/": NATIVE_CALLBACK_PATH }] }] },
    // ASWebAuthenticationSession only accepts an https callback on a domain listed under webcredentials.
    webcredentials: { apps: appIDs },
  };
}

/** The file Android fetches to verify the app owns the callback link. Null while no app is configured. */
export function androidAssetLinks(env: AppLinkEnv = process.env) {
  const packageName = env.ANDROID_APP_PACKAGE?.trim();
  const fingerprints = list(env.ANDROID_APP_SHA256_FINGERPRINTS).map((fingerprint) => fingerprint.toUpperCase());
  if (!packageName || !ANDROID_PACKAGE.test(packageName)) return null;
  if (fingerprints.length === 0 || !fingerprints.every((fingerprint) => SHA256_FINGERPRINT.test(fingerprint))) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints },
    },
  ];
}

/** A JSON response without redirects or localisation, which both platforms require, or a 404 while unconfigured. */
export function appLinkResponse(body: unknown): Response {
  if (body === null) return new Response(null, { status: 404 });
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}

export type AppStore = "appStore" | "playStore";

function httpsUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value?.trim() ?? "");
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Store listings from `APP_STORE_URL` and `PLAY_STORE_URL`. A phone sees only its own platform's store,
 * anything else sees every configured one. Empty while no listing is configured.
 */
export function appStoreLinks(userAgent: string, env: AppLinkEnv = process.env): { store: AppStore; url: string }[] {
  const links = [
    { store: "appStore" as const, url: httpsUrl(env.APP_STORE_URL) },
    { store: "playStore" as const, url: httpsUrl(env.PLAY_STORE_URL) },
  ].filter((link): link is { store: AppStore; url: string } => link.url !== null);
  const platform: AppStore | null = /iPhone|iPad|iPod/.test(userAgent)
    ? "appStore"
    : /Android/.test(userAgent)
      ? "playStore"
      : null;
  const own = links.filter((link) => link.store === platform);
  return own.length > 0 ? own : links;
}
