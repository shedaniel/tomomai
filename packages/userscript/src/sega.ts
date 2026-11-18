import { GM, GM_cookie } from "vite-plugin-monkey/dist/client";
import { API_BASE, SignInRequired, accessToken, request, signOut } from "./auth";

const CLAL = /^[A-Za-z0-9]{64}$/;

type Cookie = { name: string; value: string };

function listWithCallback(url: string): Promise<Cookie[]> {
  return new Promise((resolve, reject) => {
    GM_cookie.list({ url }, (cookies, error) => (error ? reject(new Error(String(error))) : resolve(cookies ?? [])));
  });
}

/**
 * The gateway's clal cookie, or null when there is none. It is HttpOnly, so only a manager that lets
 * scripts read HttpOnly cookies returns it, and the others list the page's other cookies without it.
 */
export async function readClal(): Promise<string | null> {
  const url = location.href;
  let cookies: Cookie[];
  if (typeof GM !== "undefined" && typeof GM?.cookie?.list === "function") {
    cookies = await GM.cookie.list({ url });
  } else if (typeof GM_cookie !== "undefined" && typeof GM_cookie?.list === "function") {
    cookies = await listWithCallback(url);
  } else {
    throw new Error("This userscript manager cannot read cookies");
  }
  const value = cookies.find(cookie => cookie.name === "clal")?.value;
  return value && CLAL.test(value) ? value : null;
}

/** Saves the cookie as the player's maimai International token. */
export async function sendClal(clal: string): Promise<void> {
  const send = async () => request("PUT", `${API_BASE}/api/v1/games/maimai/fetch/token?region=intl`, {
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    data: JSON.stringify({ clal }),
  });
  const { status, body } = await send();
  if (status === 200) return;
  // A revoked or expired grant answers 401 or 403, so the player signs in again.
  if (status === 401 || status === 403) {
    signOut();
    throw new SignInRequired();
  }
  throw new Error(String(body.error ?? `tomomai refused the cookie (${status})`));
}
