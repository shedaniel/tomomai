import { resolveBaseUrl } from "@/lib/base-url";
import { CANONICAL_GAME_IDS } from "@/lib/games/ids";
import { getGame } from "@/lib/games/registry";

/** The one path a native app's universal link or App Link claims, on each allowlisted host. */
export const NATIVE_CALLBACK_PATH = "/oauth/app-callback";

/**
 * A public client holds no secret and relies on PKCE. A native app returns through its app link, and a
 * browser client, such as the userscript, through a page of its own on one of our hosts.
 */
export const PUBLIC_CLIENT_TYPES = ["native", "user-agent-based"] as const;
export type PublicClientType = (typeof PUBLIC_CLIENT_TYPES)[number];

const LOOPBACK_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];

const CONFIDENTIAL_AUTH_METHODS = ["client_secret_basic", "client_secret_post"];
const PUBLIC_GRANT_TYPES = ["authorization_code", "refresh_token"];

type ClientBody = Record<string, unknown>;

export function isPublicClientType(value: unknown): value is PublicClientType {
  return PUBLIC_CLIENT_TYPES.includes(value as PublicClientType);
}

/**
 * Hosts a public client may redirect to. `PUBLIC_CLIENT_REDIRECT_HOSTS` is a comma-separated list of hosts,
 * and the deployment's own host is the default. A browser client may also use every game's site, so one
 * userscript app can carry each site's callback.
 */
export function publicRedirectHosts(
  type: PublicClientType,
  configured: string | undefined = process.env.PUBLIC_CLIENT_REDIRECT_HOSTS,
  baseUrl: string = resolveBaseUrl(),
): string[] {
  const hosts = configured
    ?.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const base = hosts?.length ? hosts : deploymentHost(baseUrl);
  if (type === "native") return base;
  return [...new Set([...base, ...CANONICAL_GAME_IDS.map((game) => getGame(game).brand.domain)])];
}

function deploymentHost(baseUrl: string): string[] {
  try {
    return [new URL(baseUrl).host];
  } catch {
    return [];
  }
}

/**
 * An https URL on an allowlisted host with no query, fragment or credentials. A native client's is the
 * app link callback, and a browser client's is any other path. A development server may also use http
 * on a loopback host.
 */
export function isPublicRedirectUrl(
  value: unknown,
  type: PublicClientType,
  hosts: readonly string[],
  allowLoopbackHttp: boolean = process.env.NODE_ENV === "development",
): value is string {
  if (typeof value !== "string") return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const onCallback = url.pathname === NATIVE_CALLBACK_PATH;
  return (
    url.href === value &&
    (url.protocol === "https:" || (allowLoopbackHttp && url.protocol === "http:" && LOOPBACK_HOSTNAMES.includes(url.hostname))) &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    (type === "native" ? onCallback : !onCallback) &&
    hosts.includes(url.host)
  );
}

/** The user-facing client routes only register confidential web clients, so a public or native client is refused. */
export function confidentialClientViolation(body: ClientBody): string | null {
  const method = body.token_endpoint_auth_method;
  if (method !== undefined && !CONFIDENTIAL_AUTH_METHODS.includes(method as string)) {
    return "Public clients cannot be registered";
  }
  if (body.type !== undefined && body.type !== "web") {
    return "Only web clients can be registered";
  }
  return null;
}

/** Everything a public client must be, checked against the body the server-only admin route receives. */
export function publicClientViolation(body: ClientBody, hosts: readonly string[]): string | null {
  if (body.token_endpoint_auth_method !== "none") return "A public client must use token_endpoint_auth_method none";
  if (!isPublicClientType(body.type)) return "A public client must have type native or user-agent-based";
  if (body.skip_consent === true) return "A public client cannot skip consent";
  if (body.require_pkce === false) return "A public client must require PKCE";
  const grantTypes = body.grant_types;
  if (Array.isArray(grantTypes) && !grantTypes.every((grant) => PUBLIC_GRANT_TYPES.includes(grant as string))) {
    return "A public client may only use the authorization_code and refresh_token grants";
  }
  const metadata = body.metadata;
  if (!metadata || typeof metadata !== "object" || (metadata as ClientBody).official !== true) {
    return "A public client must be official";
  }
  return publicRedirectViolation(body.type, body.redirect_uris, hosts);
}

/** What an update may change on a stored public client: not its type, auth method or grants, and redirects only within its rule. */
export function publicClientUpdateViolation(type: PublicClientType, update: ClientBody, hosts: readonly string[]): string | null {
  if (update.type !== undefined && update.type !== type) return "A public client cannot change its type";
  if (update.token_endpoint_auth_method !== undefined && update.token_endpoint_auth_method !== "none") {
    return "A public client cannot gain a secret";
  }
  const grantTypes = update.grant_types;
  if (Array.isArray(grantTypes) && !grantTypes.every((grant) => PUBLIC_GRANT_TYPES.includes(grant as string))) {
    return "A public client may only use the authorization_code and refresh_token grants";
  }
  return update.redirect_uris === undefined ? null : publicRedirectViolation(type, update.redirect_uris, hosts);
}

export function publicRedirectViolation(type: PublicClientType, redirectUris: unknown, hosts: readonly string[]): string | null {
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) return "A public client needs a redirect URI";
  if (!redirectUris.every((uri) => isPublicRedirectUrl(uri, type, hosts))) {
    return type === "native"
      ? `Native redirect URIs must be https://<allowed host>${NATIVE_CALLBACK_PATH} with no query or fragment`
      : `Browser redirect URIs must be https://<allowed host>/<path> with no query or fragment, and not ${NATIVE_CALLBACK_PATH}`;
  }
  return null;
}
