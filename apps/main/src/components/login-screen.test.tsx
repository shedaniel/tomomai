// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameProvider } from "@/components/providers/game-provider";
import { loadMessages } from "@/i18n/messages";
import type { CanonicalGameId } from "@/lib/games/ids";
import type { Locale } from "@/i18n/locale";
import { LoginScreen } from "./login-screen";
import messages from "../../messages/en.json";
import zhCN from "../../messages/zh-CN.json";
import { testGame } from "@/test/games";

vi.mock("@/lib/trpc-client", () => ({ trpc: { user: {
  getPolicies: { useQuery: () => ({ data: { tos: { content: "Terms" }, privacy: { content: "Privacy" } } }) },
} } }));
vi.mock("@/lib/auth-client", () => ({ signIn: { social: vi.fn() }, authClient: { signIn: { passkey: vi.fn() } } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>,
}));
vi.mock("@/components/locale-switcher", () => ({ LocaleSwitcher: () => null }));
vi.mock("@/components/games/maimai/minigame-cards", () => ({ MinigameCards: () => null }));
const locale = vi.hoisted(() => ({ current: "en" as Locale }));
vi.mock("@/components/providers/locale-provider", () => ({ useLocale: () => ({ locale: locale.current }) }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  locale.current = "en";
});

async function render(game: CanonicalGameId) {
  await act(async () => root.render(
    <NextIntlClientProvider locale={locale.current} messages={await loadMessages(game, locale.current)} timeZone="UTC">
      <GameProvider game={testGame(game, ["intl", "jp"])}>
        <LoginScreen signupRequirements={{ signupEnabled: true, inviteRequired: false, reason: "open" }} flags={{ passkey: false, twitterOauth: false }} />
      </GameProvider>
    </NextIntlClientProvider>,
  ));
}

async function openConsent(label = messages.auth.signup) {
  const signup = Array.from(document.querySelectorAll("button")).find(button => button.textContent === label);
  await act(async () => signup?.click());
}

it("brands the CHUNITHM login and sign-up consent as tomochu", async () => {
  await render("chunithm");
  expect(container.querySelector("h1")?.textContent).toBe("tomochu ともチュウ");
  expect(container.textContent).toContain("tomochu ともチュウ DB is a public database of CHUNITHM charts.");
  expect(container.textContent).toContain("Import data directly from CHUNITHM-NET");
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector('a[href^="/profile/"]')).toBeNull();

  await openConsent();
  expect(document.body.textContent).toContain("Welcome to tomochu");
  expect(document.body.textContent).not.toMatch(/tomomai|ともマイ|maimai/);
});

it("keeps the maimai logo, copy and example profile", async () => {
  await render("maimai");
  const logos = Array.from(container.querySelectorAll("img"));
  expect(logos.map(logo => [logo.alt, decodeURIComponent(logo.src)])).toEqual([
    ["tomomai", expect.stringContaining("/icon-small.webp")],
    ["tomomai", expect.stringContaining("/icon-small-dark.webp")],
  ]);
  expect(container.querySelector("h1")?.textContent).toBe("tomomai ともマイ");
  expect(container.textContent).toContain("Import data directly from maimai DX NET");
  expect(container.querySelector('a[href="/profile/shedaniel/intl"]')?.textContent).toContain("@shedaniel");

  await openConsent();
  expect(document.body.textContent).toContain("Welcome to tomomai");
  expect(document.body.textContent).not.toMatch(/tomochu|ともチュウ/);
});

it("names CHUNITHM in the Simplified Chinese region note", async () => {
  locale.current = "zh-CN";
  await render("chunithm");
  await openConsent(zhCN.auth.signup);
  expect(document.body.textContent).toContain("支持 CHUNITHM 日本版及国际版覆盖地区");
  expect(document.body.textContent).not.toMatch(/tomomai|ともマイ|maimai/);
});
