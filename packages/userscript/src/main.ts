import { GM_info } from "vite-plugin-monkey/dist/client";
import { SignInRequired, isSignedIn, signIn, signOut } from "./auth";
import { readClal, sendClal } from "./sega";

const GATEWAY_HOST = "lng-tgk-aime-gw.am-all.net";
const SITE_LOGIN = "https://maimaidx-eng.com/maimai-mobile/";

const STYLES = `
:host { all: initial; }
.panel {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  width: min(22rem, calc(100vw - 32px)); box-sizing: border-box; padding: 16px;
  border: 1px solid #e4e4e7; border-radius: 12px; background: #fff; color: #18181b;
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.15);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.title { font-weight: 600; }
p { margin: 0 0 12px; }
.hint { font-size: 12px; color: #71717a; }
.error { color: #dc2626; }
.button {
  display: block; width: 100%; box-sizing: border-box; padding: 8px 12px; border: 1px solid transparent;
  border-radius: 8px; background: oklch(0.5 0.152 0); color: #fff; font: inherit; font-weight: 500;
  text-align: center; text-decoration: none; cursor: pointer;
}
.button.outline { background: transparent; border-color: #e4e4e7; color: inherit; }
.button:disabled { opacity: 0.6; cursor: default; }
.link { padding: 0; border: 0; background: none; color: #71717a; font: inherit; font-size: 12px; cursor: pointer; }
.link:hover { color: inherit; text-decoration: underline; }
.foot { margin-top: 12px; }
@media (prefers-color-scheme: dark) {
  .panel { background: #18181b; color: #fafafa; border-color: #3f3f46; }
  .button { background: oklch(0.85 0.135 0); color: #18181b; }
  .button.outline { background: transparent; border-color: #3f3f46; color: inherit; }
  .hint, .link { color: #a1a1aa; }
}
`;

type State =
  | { kind: "checking" }
  | { kind: "no-cookie" }
  | { kind: "ready"; clal: string }
  | { kind: "sending"; clal: string }
  | { kind: "sent" }
  | { kind: "error"; clal: string | null; message: string };

function element<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, children: (Node | string)[] = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function errorMessage(err: unknown): string {
  if (err instanceof SignInRequired) return "Your tomomai sign-in has expired. Send again to sign in.";
  return err instanceof Error ? err.message : String(err);
}

/** The panel on the SEGA gateway page that sends the login cookie to tomomai. */
function mountPanel() {
  const host = element("div", { id: "tomomai-root" });
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.append(element("style", { textContent: STYLES }));
  const panel = element("div", { className: "panel" });
  shadow.append(panel);

  let state: State = { kind: "checking" };
  const setState = (next: State) => {
    state = next;
    render();
  };

  async function send(clal: string) {
    setState({ kind: "sending", clal });
    try {
      // Called before any await, so the popup still counts as opened by the click.
      if (!isSignedIn()) await signIn();
      await sendClal(clal);
      setState({ kind: "sent" });
    } catch (err) {
      setState({ kind: "error", clal, message: errorMessage(err) });
    }
  }

  function body(): (Node | string)[] {
    switch (state.kind) {
      case "checking":
        return [element("p", { className: "hint", textContent: "Looking for your login cookie..." })];
      case "no-cookie":
        return [
          element("p", { textContent: "No login cookie here yet. Sign in to maimai DX NET first, then open this page again." }),
          element("p", {
            className: "hint",
            textContent: "If you are signed in already, your userscript manager is not letting scripts read HttpOnly cookies. Check its cookie setting in the tomomai guide.",
          }),
          element("a", { className: "button outline", href: SITE_LOGIN, target: "_blank", rel: "noopener noreferrer", textContent: "Sign in to maimai DX NET" }),
        ];
      case "ready":
      case "sending": {
        const { clal } = state;
        return [
          element("p", {
            textContent: "Found your login cookie. Send it to tomomai to fetch your scores." +
              (isSignedIn() ? "" : " A tomomai window opens first so you can sign in."),
          }),
          element("button", {
            className: "button",
            disabled: state.kind === "sending",
            textContent: state.kind === "sending" ? "Sending..." : "Send to tomomai",
            onclick: () => void send(clal),
          }),
        ];
      }
      case "sent":
        return [element("p", { textContent: "Sent. Go back to tomomai, where your fetch starts on its own." })];
      case "error": {
        const { clal } = state;
        return [
          element("p", { className: "error", textContent: state.message }),
          ...(clal ? [element("button", { className: "button", textContent: "Try again", onclick: () => void send(clal) })] : []),
        ];
      }
    }
  }

  function render() {
    const foot = isSignedIn() && state.kind !== "sending"
      ? [element("div", { className: "foot" }, [element("button", {
        className: "link",
        textContent: "Sign out of tomomai in this script",
        onclick: () => {
          signOut();
          render();
        },
      })])]
      : [];
    panel.replaceChildren(
      element("div", { className: "head" }, [
        element("span", { className: "title", textContent: "tomomai" }),
        element("button", { className: "link", textContent: "Hide", onclick: () => host.remove() }),
      ]),
      ...body(),
      ...foot,
    );
  }

  render();
  readClal().then(
    clal => setState(clal ? { kind: "ready", clal } : { kind: "no-cookie" }),
    (err: unknown) => setState({ kind: "error", clal: null, message: errorMessage(err) }),
  );
}

/** On tomomai's own pages the script only says it is installed, so the token dialog can skip its setup steps. */
function announce() {
  document.documentElement.setAttribute("data-tomomai-userscript", GM_info.script.version);
  window.dispatchEvent(new Event("tomomai:userscript"));
}

function start() {
  if (location.hostname === GATEWAY_HOST) mountPanel();
  else announce();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
