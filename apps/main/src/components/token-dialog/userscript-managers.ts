export type BrowserFamily = "chrome" | "edge" | "firefox" | "safari" | "opera" | "other";

export const BROWSERS = [
  { id: "chrome", family: "chrome" },
  { id: "edge", family: "edge" },
  { id: "firefox", family: "firefox" },
  { id: "safari", family: "safari" },
  { id: "opera", family: "opera" },
  { id: "firefox-android", family: "firefox" },
  { id: "edge-android", family: "edge" },
  { id: "chrome-android", family: "chrome" },
  { id: "ios", family: "safari" },
  { id: "other", family: "other" },
] as const satisfies readonly { id: string; family: BrowserFamily }[];

export type BrowserId = (typeof BROWSERS)[number]["id"];

export type ManagerId = "tampermonkey" | "tampermonkey-beta" | "violentmonkey" | "scriptcat" | "firemonkey" | "greasemonkey" | "userscripts" | "stay";

export const MANAGER_NAMES: Record<ManagerId, string> = {
  tampermonkey: "Tampermonkey",
  "tampermonkey-beta": "Tampermonkey BETA",
  violentmonkey: "Violentmonkey",
  scriptcat: "ScriptCat",
  firemonkey: "FireMonkey",
  greasemonkey: "Greasemonkey",
  userscripts: "Userscripts App",
  stay: "Stay App",
};

export const MANAGER_ICONS: Record<ManagerId, string> = {
  tampermonkey: "/brand/userscript-managers/tampermonkey.svg",
  "tampermonkey-beta": "/brand/userscript-managers/tampermonkey.svg",
  violentmonkey: "/brand/userscript-managers/violentmonkey.svg",
  scriptcat: "/brand/userscript-managers/scriptcat.png",
  firemonkey: "/brand/userscript-managers/firemonkey.svg",
  greasemonkey: "/brand/userscript-managers/greasemonkey.svg",
  userscripts: "/brand/userscript-managers/userscripts.png",
  stay: "/brand/userscript-managers/stay.png",
};

/** Why a manager cannot read the HttpOnly `clal` cookie, or why it is not known to. */
export type ManagerCaveat = "hidesHttpOnly" | "noCookieApi" | "safariUntested";

export type ManagerOption =
  | { manager: ManagerId; support: "works"; url: string }
  | { manager: ManagerId; support: "untested"; url: string; caveat: ManagerCaveat }
  | { manager: ManagerId; support: "incompatible"; caveat: ManagerCaveat };

const CHROME_STORE = "https://chromewebstore.google.com/detail/";
const EDGE_STORE = "https://microsoftedge.microsoft.com/addons/detail/";
const FIREFOX_STORE = "https://addons.mozilla.org/firefox/addon/";

const FIREFOX_INCOMPATIBLE: ManagerOption[] = [
  { manager: "firemonkey", support: "incompatible", caveat: "hidesHttpOnly" },
  { manager: "greasemonkey", support: "incompatible", caveat: "noCookieApi" },
];

const SAFARI_TAMPERMONKEY: ManagerOption = {
  manager: "tampermonkey",
  support: "untested",
  url: "https://www.tampermonkey.net/?browser=safari",
  caveat: "safariUntested",
};

export const MANAGER_OPTIONS: Record<BrowserId, readonly ManagerOption[]> = {
  chrome: [
    { manager: "tampermonkey-beta", support: "works", url: `${CHROME_STORE}gcalenpjmijncebpfijmoaglllgpjagf` },
    { manager: "tampermonkey", support: "works", url: `${CHROME_STORE}dhdgffkkebhmkfjojejmpbldmpobfkfo` },
    { manager: "violentmonkey", support: "works", url: `${CHROME_STORE}jinjaccalgkegednnccohejagnlnfdag` },
    { manager: "scriptcat", support: "works", url: `${CHROME_STORE}ndcooeababalnlpkfedmmbbbgkljhpjf` },
  ],
  edge: [
    { manager: "tampermonkey-beta", support: "works", url: `${EDGE_STORE}fcmfnpggmnlmfebfghbfnillijihnkoh` },
    { manager: "tampermonkey", support: "works", url: `${EDGE_STORE}iikmkjmpaadaobahmlepeloendndfphd` },
    { manager: "violentmonkey", support: "works", url: `${EDGE_STORE}eeagobfjdenkkddmbclomhiblgggliao` },
    { manager: "scriptcat", support: "works", url: `${EDGE_STORE}liilgpjgabokdklappibcjfablkpcekh` },
  ],
  firefox: [
    { manager: "tampermonkey", support: "works", url: `${FIREFOX_STORE}tampermonkey/` },
    { manager: "violentmonkey", support: "works", url: `${FIREFOX_STORE}violentmonkey/` },
    { manager: "scriptcat", support: "works", url: `${FIREFOX_STORE}scriptcat/` },
    ...FIREFOX_INCOMPATIBLE,
  ],
  safari: [
    SAFARI_TAMPERMONKEY,
    { manager: "userscripts", support: "incompatible", caveat: "noCookieApi" },
  ],
  opera: [
    { manager: "tampermonkey", support: "works", url: "https://www.tampermonkey.net/?browser=opera" },
  ],
  "firefox-android": [
    { manager: "tampermonkey", support: "works", url: `${FIREFOX_STORE}tampermonkey/` },
    { manager: "violentmonkey", support: "works", url: `${FIREFOX_STORE}violentmonkey/` },
    ...FIREFOX_INCOMPATIBLE,
  ],
  "edge-android": [
    { manager: "tampermonkey", support: "works", url: `${EDGE_STORE}iikmkjmpaadaobahmlepeloendndfphd` },
  ],
  "chrome-android": [],
  ios: [
    SAFARI_TAMPERMONKEY,
    { manager: "userscripts", support: "incompatible", caveat: "noCookieApi" },
    { manager: "stay", support: "incompatible", caveat: "noCookieApi" },
  ],
  other: [],
};

/** The closest browser we have guidance for, from the user agent. */
export function detectBrowser(userAgent: string, maxTouchPoints = 0): BrowserId {
  // iPadOS reports a desktop Mac user agent, so touch support gives it away.
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "ios";
  if (/Android/.test(userAgent)) {
    if (/EdgA\//.test(userAgent)) return "edge-android";
    if (/Firefox\//.test(userAgent)) return "firefox-android";
    if (/SamsungBrowser\/|OPR\//.test(userAgent)) return "other";
    if (/Chrome\//.test(userAgent)) return "chrome-android";
    return "other";
  }
  if (/Edg\//.test(userAgent)) return "edge";
  if (/OPR\//.test(userAgent)) return "opera";
  if (/Firefox\//.test(userAgent)) return "firefox";
  if (/Chrome\//.test(userAgent)) return "chrome";
  if (/Safari\//.test(userAgent)) return "safari";
  return "other";
}
