// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthDialogProvider } from "@/components/auth/auth-dialog-provider";
import { GameProvider } from "@/components/providers/game-provider";
import { loadMessages } from "@/i18n/messages";
import type { CanonicalGameId } from "@/lib/games/ids";
import type { Locale } from "@/i18n/locale";
import { LandingPage } from "./landing-page";
import { testGame } from "@/test/games";

const signInOptions = { signup: { signupEnabled: true, inviteRequired: false, reason: "open" as const }, passkey: false, twitterOauth: false };

vi.mock("@/lib/trpc-client", () => ({ trpc: {
  useUtils: () => ({ user: { getSignInOptions: { setData: vi.fn() } } }),
  user: {
    getSignInOptions: { useQuery: () => ({ data: { signup: { signupEnabled: true, inviteRequired: false, reason: "open" }, passkey: false, twitterOauth: false } }) },
    getPolicies: { useQuery: () => ({ data: { tos: { content: "Terms" }, privacy: { content: "Privacy" } } }) },
  },
} }));
vi.mock("@/lib/auth-client", () => ({
  signIn: { social: vi.fn() },
  authClient: { signIn: { passkey: vi.fn() }, getSession: vi.fn(async () => ({ data: null })) },
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>,
}));
vi.mock("@/components/header", () => ({ Header: () => null }));
vi.mock("@/components/games/maimai/minigame-cards", () => ({ MinigameCards: () => null }));
const locale = vi.hoisted(() => ({ current: "en" as Locale }));
vi.mock("@/components/providers/locale-provider", () => ({ useLocale: () => ({ locale: locale.current }) }));

let root: Root;
let container: HTMLDivElement;
let messages: Awaited<ReturnType<typeof loadMessages>>;
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
  messages = await loadMessages(game, locale.current);
  await act(async () => root.render(
    <NextIntlClientProvider locale={locale.current} messages={messages} timeZone="UTC">
      <GameProvider game={testGame(game, ["intl", "jp"])}>
        <AuthDialogProvider>
          <LandingPage signInOptions={signInOptions} />
        </AuthDialogProvider>
      </GameProvider>
    </NextIntlClientProvider>,
  ));
}

async function openSignUp() {
  const label = (messages as { auth: { createAccount: string } }).auth.createAccount;
  const button = Array.from(container.querySelectorAll("button")).find(candidate => candidate.textContent === label);
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

it("brands the CHUNITHM landing page and sign-up dialog as tomochu", async () => {
  await render("chunithm");
  expect(container.querySelector("h1")?.textContent).toBe("Track your CHUNITHM scores");
  expect(container.textContent).toContain("Import from CHUNITHM-NET");
  expect(container.textContent).toContain("tomochu DB");
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector('a[href^="/profile/"]')).toBeNull();

  await openSignUp();
  expect(document.body.textContent).toContain("Create your tomochu account");
  expect(document.body.textContent).not.toMatch(/tomomai|ともマイ|maimai/);
});

it("keeps the maimai copy, example profile and screenshot", async () => {
  await render("maimai");
  expect(container.querySelector("h1")?.textContent).toBe("Track your maimai DX scores");
  expect(container.textContent).toContain("Import from maimai DX NET");
  expect(container.textContent).toContain("tomomai DB");
  expect(container.querySelector('a[href="/profile/shedaniel/intl"]')).not.toBeNull();
  expect(decodeURIComponent(container.querySelector("img")?.getAttribute("src") ?? "")).toContain("dashboard-new.webp");

  await openSignUp();
  expect(document.body.textContent).toContain("Create your tomomai account");
  expect(document.body.textContent).not.toMatch(/tomochu|ともチュウ/);
});

it("names CHUNITHM in the Simplified Chinese region note", async () => {
  locale.current = "zh-CN";
  await render("chunithm");
  await openSignUp();
  expect(document.body.textContent).toContain("支持 CHUNITHM 日本版及国际版覆盖地区");
  expect(document.body.textContent).not.toMatch(/tomomai|ともマイ|maimai/);
});
