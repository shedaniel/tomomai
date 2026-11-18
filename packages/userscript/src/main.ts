import { GM_getValue, GM_info, GM_setValue } from "vite-plugin-monkey/dist/client";
import logoDark from "./assets/logo-dark.webp?inline";
import logoLight from "./assets/logo.webp?inline";
import { isSignedIn, signIn, signOut } from "./auth";
import { LOCALES, LOCALE_NAMES, type Locale } from "./i18n";
import { ScriptError, chooseLocale, currentLocale, messages, rememberSiteLocale } from "./locale";
import { readClal, sendClal } from "./sega";

const GATEWAY_HOST = "lng-tgk-aime-gw.am-all.net";
const GATEWAY_LANDING = `https://${GATEWAY_HOST}/common_auth/`;
const NET_HOST = "maimaidx-eng.com";
// Tags the sign-in form opened from the panel. The gateway ignores it and does not pass it on.
const SIGN_IN_MARK = "tomomai=signin";
const NET_LOGIN = `https://${GATEWAY_HOST}/common_auth/login?site_id=maimaidxex&redirect_url=https://${NET_HOST}/maimai-mobile/&back_url=https://maimai.sega.com/&${SIGN_IN_MARK}`;

// SEGA returns a signed-in player to DX NET (a server redirect through ?ssid=), not to the gateway, so the
// script sends them back itself as soon as the DX NET page starts loading.
const KEY_RETURN = "returnToGatewayAt";
const KEY_RETURNED = "returnedToGatewayAt";
const RETURN_WINDOW_MS = 30 * 60 * 1000;

const ICONS = {
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  cookie: '<path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/><path d="M7 14v.01"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  signIn: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  spinner: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
} as const;

type IconName = keyof typeof ICONS;

// The site's theme tokens at its default hue, so the panel reads as part of tomomai.
const STYLES = `
:host { all: initial; }
.panel {
  --content: oklch(0.995 0.0027 0); --foreground: oklch(0.448 0.0963 0); --muted: oklch(0.956 0.009 0);
  --muted-foreground: oklch(0.448 0.0963 0 / 72%); --primary: oklch(0.5 0.152 0); --primary-foreground: oklch(0.969 0.0135 0);
  --border: oklch(0.9 0.0137 0); --destructive: oklch(0.577 0.245 27.325);
  position: fixed; right: 16px; top: 16px; z-index: 2147483647;
  width: min(368px, calc(100vw - 32px)); box-sizing: border-box; padding: 20px;
  border: 1px solid var(--border); border-radius: 28px; background: var(--content); color: var(--foreground);
  box-shadow: 0 24px 48px -12px oklch(0.3 0.05 0 / 0.25);
  font: 14px/1.5 Inter, system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "PingFang SC", "PingFang TC",
    "Apple SD Gothic Neo", "Microsoft YaHei", "Microsoft JhengHei", "Malgun Gothic", "Noto Sans CJK JP", sans-serif;
  animation: enter 0.25s ease-out;
}
.backdrop {
  position: fixed; inset: 0; z-index: 2147483646; display: grid; place-items: center; padding: 16px;
  background: oklch(0.25 0.03 0 / 0.4); backdrop-filter: blur(6px); animation: fade 0.2s ease-out;
}
.backdrop .panel { position: static; width: min(400px, 100%); padding: 24px; }
@keyframes fade { from { opacity: 0; } }
@keyframes enter { from { opacity: 0; transform: translateY(8px); } }
@keyframes spin { to { transform: rotate(360deg); } }
.head { display: flex; align-items: center; justify-content: space-between; margin: -4px -6px 16px 0; }
.logo { height: 32px; width: auto; display: block; }
.logo.dark { display: none; }
.tools { display: flex; align-items: center; gap: 2px; }
.locale { position: relative; display: flex; align-items: center; height: 32px; border-radius: 999px; color: var(--muted-foreground); }
.locale:hover, .locale:focus-within { background: var(--muted); color: var(--foreground); }
.locale svg { position: absolute; pointer-events: none; width: 15px; height: 15px; }
.locale svg:first-child { left: 9px; }
.locale svg:last-child { right: 8px; width: 13px; height: 13px; }
.locale select {
  appearance: none; height: 32px; padding: 0 26px 0 30px; border: 0; border-radius: 999px; background: transparent;
  color: inherit; font: inherit; font-size: 12px; font-weight: 500; cursor: pointer;
}
.locale select:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
.locale option { color: #18181b; background: #fff; }
.close { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 999px; background: none; color: var(--muted-foreground); cursor: pointer; }
.close:hover { background: var(--muted); color: var(--foreground); }
.status { display: flex; gap: 12px; align-items: flex-start; }
.status.solo { align-items: center; }
.badge { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 999px; background: var(--muted); color: var(--primary); }
.badge.error { color: var(--destructive); }
.title { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.4; }
.text { margin: 4px 0 0; color: var(--muted-foreground); }

.actions { display: grid; gap: 8px; margin-top: 16px; }
.button {
  display: flex; align-items: center; justify-content: center; gap: 8px; height: 40px; box-sizing: border-box; padding: 0 16px;
  border: 1px solid transparent; border-radius: 999px; background: var(--primary); color: var(--primary-foreground);
  font: inherit; font-weight: 500; text-decoration: none; cursor: pointer; transition: filter 0.15s;
}
.button:hover { filter: brightness(1.08); }
.button.outline { background: transparent; border-color: var(--border); color: var(--foreground); }
.button.outline:hover { filter: none; background: var(--muted); }
.button:disabled { opacity: 0.7; cursor: default; filter: none; }
.foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted-foreground); }
.link { padding: 0; border: 0; background: none; color: inherit; font: inherit; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.link:hover { color: var(--foreground); }
svg { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.spin { animation: spin 0.9s linear infinite; }
@media (prefers-color-scheme: dark) {
  .panel {
    --content: oklch(0.205 0.018 0); --foreground: oklch(0.9 0.009 0); --muted: oklch(0.269 0.0225 0);
    --muted-foreground: oklch(0.708 0.027 0); --primary: oklch(0.85 0.135 0); --primary-foreground: oklch(0.15 0.045 0);
    --border: oklch(1 0.0108 0 / 14%); --destructive: oklch(0.704 0.191 22.216);
    box-shadow: 0 24px 48px -12px rgb(0 0 0 / 0.6);
  }
  .logo.light { display: none; }
  .logo.dark { display: block; }
}
@media (prefers-reduced-motion: reduce) { .panel, .backdrop, .spin { animation: none; } }
`;

type State =
  | { kind: "checking" }
  | { kind: "signed-out" }
  | { kind: "unreadable" }
  | { kind: "ready"; clal: string }
  | { kind: "signing-in"; clal: string }
  | { kind: "sending"; clal: string }
  | { kind: "sent" }
  | { kind: "error"; clal: string | null; err: unknown };

function element<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, children: (Node | string)[] = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function icon(name: IconName, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  if (className) svg.setAttribute("class", className);
  svg.innerHTML = ICONS[name];
  return svg;
}

function button(label: string, onclick: () => void, { iconName, outline = false, disabled = false }: { iconName?: IconName; outline?: boolean; disabled?: boolean } = {}) {
  const node = element("button", { className: outline ? "button outline" : "button", disabled, onclick });
  if (iconName) node.append(icon(iconName, iconName === "spinner" ? "spin" : ""));
  node.append(label);
  return node;
}

function errorMessage(err: unknown): string {
  if (err instanceof ScriptError) return err.localized();
  return err instanceof Error ? err.message : String(err);
}

function recent(key: string): boolean {
  const at = GM_getValue(key, 0) as number;
  return at > 0 && Date.now() - at < RETURN_WINDOW_MS;
}

function localeSwitcher(onChange: () => void) {
  const current = currentLocale();
  const select = document.createElement("select");
  select.ariaLabel = select.title = messages().language;
  select.onchange = () => {
    chooseLocale(select.value as Locale);
    onChange();
  };
  for (const locale of LOCALES) {
    select.append(new Option(LOCALE_NAMES[locale], locale, false, locale === current));
  }
  return element("label", { className: "locale" }, [icon("languages"), select, icon("chevron")]);
}

/**
 * A card in its own closed shadow root so the SEGA page's styles stay out. Centered over the gateway's
 * Not Found page, which only tomomai sends people to, and in the corner of SEGA's sign-in form. It is
 * drawn again from `content` whenever the player switches language.
 */
function mountShell(layout: "center" | "corner", content: () => (Node | string)[], onClose?: () => void) {
  const host = element("div", { id: "tomomai-root" });
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.append(element("style", { textContent: STYLES }));
  const panel = element("div", { className: "panel", role: "dialog", ariaLabel: "tomomai" });
  shadow.append(layout === "center" ? element("div", { className: "backdrop" }, [panel]) : panel);

  function render() {
    const t = messages();
    panel.lang = currentLocale();
    const close = element("button", { className: "close", ariaLabel: t.close, title: t.close, onclick: () => {
      onClose?.();
      host.remove();
    } });
    close.append(icon("close"));
    panel.replaceChildren(
      element("div", { className: "head" }, [
        element("span", {}, [
          element("img", { className: "logo light", src: logoLight, alt: "tomomai" }),
          element("img", { className: "logo dark", src: logoDark, alt: "tomomai" }),
        ]),
        element("div", { className: "tools" }, [localeSwitcher(render), close]),
      ]),
      ...content(),
    );
  }

  render();
  return { render };
}

function status(iconName: IconName, title: string, text: string | null, { error = false } = {}) {
  return element("div", { className: text ? "status" : "status solo" }, [
    element("span", { className: error ? "badge error" : "badge" }, [icon(iconName, iconName === "spinner" ? "spin" : "")]),
    element("div", {}, [
      element("p", { className: "title", textContent: title }),
      ...(text ? [element("p", { className: "text", textContent: text })] : []),
    ]),
  ]);
}

/** The panel on the gateway landing page, which says Not Found but carries the clal cookie. */
function mountPanel() {
  const cameBack = recent(KEY_RETURNED);
  GM_setValue(KEY_RETURNED, 0);

  let state: State = { kind: "checking" };
  const setState = (next: State) => {
    state = next;
    shell.render();
  };

  async function send(clal: string) {
    try {
      if (!isSignedIn()) {
        // Opened before any await, so the popup still counts as opened by the click.
        const signingIn = signIn();
        setState({ kind: "signing-in", clal });
        await signingIn;
      }
      setState({ kind: "sending", clal });
      await sendClal(clal);
      setState({ kind: "sent" });
    } catch (err) {
      setState({ kind: "error", clal, err });
    }
  }

  function goSignIn() {
    GM_setValue(KEY_RETURN, Date.now());
    location.href = NET_LOGIN;
  }

  function closeTab(label: HTMLButtonElement) {
    window.close();
    // Managers only let a script close a tab it may close, so say where to go when it stays open.
    setTimeout(() => {
      label.replaceWith(element("p", { className: "text", textContent: messages().canCloseTab }));
    }, 300);
  }

  function body(): (Node | string)[] {
    const t = messages();
    switch (state.kind) {
      case "checking":
        return [status("spinner", t.checking, null)];
      case "signed-out":
        return [
          status("signIn", t.signedOutTitle, t.signedOutText),
          element("div", { className: "actions" }, [button(t.signInButton, goSignIn, { iconName: "signIn" })]),
        ];
      case "unreadable":
        return [
          status("alert", t.unreadableTitle, t.unreadableText, { error: true }),
          element("div", { className: "actions" }, [button(t.signInAgain, goSignIn, { iconName: "signIn" })]),
        ];
      case "signing-in":
        return [
          status("spinner", t.signingInTitle, t.signingInText),
          element("div", { className: "actions" }, [button(t.signingInButton, () => {}, { iconName: "spinner", disabled: true })]),
        ];
      case "ready":
      case "sending": {
        const { clal } = state;
        const sending = state.kind === "sending";
        return [
          status("cookie", t.readyTitle, isSignedIn() ? null : t.readyPopupNote),
          element("div", { className: "actions" }, [
            button(sending ? t.sending : t.send, () => void send(clal), { iconName: sending ? "spinner" : "send", disabled: sending }),
          ]),
        ];
      }
      case "sent": {
        const done = button(t.closeTab, () => closeTab(done), { outline: true });
        return [
          status("check", t.sentTitle, t.sentText),
          element("div", { className: "actions" }, [done]),
        ];
      }
      case "error": {
        const { clal } = state;
        return [
          status("alert", t.errorTitle, errorMessage(state.err), { error: true }),
          ...(clal ? [element("div", { className: "actions" }, [button(t.tryAgain, () => void send(clal), { iconName: "send" })])] : []),
        ];
      }
    }
  }

  function content(): (Node | string)[] {
    const t = messages();
    const busy = state.kind === "sending" || state.kind === "checking" || state.kind === "signing-in";
    const foot = isSignedIn() && !busy
      ? [element("div", { className: "foot" }, [
        element("span", { textContent: t.signedIn }),
        element("button", {
          className: "link",
          textContent: t.signOut,
          onclick: () => {
            signOut();
            shell.render();
          },
        }),
      ])]
      : [];
    return [...body(), ...foot];
  }

  const shell = mountShell("center", content);
  readClal().then(
    clal => setState(clal ? { kind: "ready", clal } : { kind: cameBack ? "unreadable" : "signed-out" }),
    (err: unknown) => setState({ kind: "error", clal: null, err }),
  );
}

/** On SEGA's sign-in form, only while the player is on their way back to the panel. */
function mountSignInHint() {
  // clal is SEGA's auto login cookie, so it only exists when that box stays ticked. Closing the hint also
  // stops the trip back, for a player who changed their mind.
  mountShell("corner", () => [status("signIn", messages().hintTitle, messages().hintText)], () => GM_setValue(KEY_RETURN, 0));
}

/**
 * On tomomai's own pages the script says it is installed, so the token dialog can skip its setup steps,
 * and notes the site's language for the panel.
 */
function announce() {
  rememberSiteLocale(document.documentElement.lang);
  document.documentElement.setAttribute("data-tomomai-userscript", GM_info.script.version);
  window.dispatchEvent(new Event("tomomai:userscript"));
}

function start() {
  const { hostname, pathname, search } = location;
  if (hostname === GATEWAY_HOST) {
    if (pathname === "/common_auth/" || pathname === "/common_auth") return mountPanel();
    if (!pathname.startsWith("/common_auth/login")) return;
    // A failed sign-in reloads the form without the tag, so the hint follows the flag the tag set.
    if (new URLSearchParams(search).has("tomomai")) GM_setValue(KEY_RETURN, Date.now());
    if (recent(KEY_RETURN)) mountSignInHint();
  } else {
    announce();
  }
}

if (location.hostname === NET_HOST) {
  if (recent(KEY_RETURN)) {
    GM_setValue(KEY_RETURN, 0);
    GM_setValue(KEY_RETURNED, Date.now());
    location.replace(GATEWAY_LANDING);
  }
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
