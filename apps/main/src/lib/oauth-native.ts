import { resolveBaseUrl } from "@/lib/base-url";

/** The one path a native app's universal link or App Link claims, on each allowlisted host. */
export const NATIVE_CALLBACK_PATH = "/oauth/app-callback";

const CONFIDENTIAL_AUTH_METHODS = ["client_secret_basic", "client_secret_post"];
const NATIVE_GRANT_TYPES = ["authorization_code", "refresh_token"];

type ClientBody = Record<string, unknown>;

/**
 * Hosts a native client may redirect to. `NATIVE_APP_REDIRECT_HOSTS` is a comma-separated list of hosts,
 * and the deployment's own host is the default.
 */
export function nativeRedirectHosts(
  configured: string | undefined = process.env.NATIVE_APP_REDIRECT_HOSTS,
  baseUrl: string = resolveBaseUrl(),
): string[] {
  const hosts = configured
    ?.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (hosts?.length) return hosts;
  try {
    return [new URL(baseUrl).host];
  } catch {
    return [];
  }
}

/** An https URL on an allowlisted host, at the callback path and with no query, fragment or credentials. */
export function isNativeRedirectUrl(value: unknown, hosts: readonly string[]): value is string {
  if (typeof value !== "string") return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.href === value &&
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    url.pathname === NATIVE_CALLBACK_PATH &&
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

/** Everything a native client must be, checked against the body the server-only admin route receives. */
export function nativeClientViolation(body: ClientBody, hosts: readonly string[]): string | null {
  if (body.token_endpoint_auth_method !== "none") return "A native client must use token_endpoint_auth_method none";
  if (body.type !== "native") return "A native client must have type native";
  if (body.skip_consent === true) return "A native client cannot skip consent";
  if (body.require_pkce === false) return "A native client must require PKCE";
  const grantTypes = body.grant_types;
  if (Array.isArray(grantTypes) && !grantTypes.every((grant) => NATIVE_GRANT_TYPES.includes(grant as string))) {
    return "A native client may only use the authorization_code and refresh_token grants";
  }
  const metadata = body.metadata;
  if (!metadata || typeof metadata !== "object" || (metadata as ClientBody).official !== true) {
    return "A native client must be official";
  }
  return nativeRedirectViolation(body.redirect_uris, hosts);
}

export function nativeRedirectViolation(redirectUris: unknown, hosts: readonly string[]): string | null {
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) return "A native client needs a redirect URI";
  if (!redirectUris.every((uri) => isNativeRedirectUrl(uri, hosts))) {
    return `Native redirect URIs must be https://<allowed host>${NATIVE_CALLBACK_PATH} with no query or fragment`;
  }
  return null;
}
