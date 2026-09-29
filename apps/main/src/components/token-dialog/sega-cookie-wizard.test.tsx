// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TokenDialog } from "@/components/token-dialog";
import { GameProvider } from "@/components/providers/game-provider";
import { toFrontendGame, type FrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import messages from "../../../messages/en.json";

const state = vi.hoisted(() => ({ query: vi.fn(), submit: vi.fn(), loginPageUrl: "" }));
vi.mock("@/lib/trpc-client", () => ({ trpc: { user: {
  getLoginOtp: { useQuery: (input: unknown) => {
    state.query(input);
    return { data: { otp: "123456", scriptUrl: "https://example.test/api/login.js", loginLink: "https://example.test/gateway#otp=123456", loginPageUrl: state.loginPageUrl, expiresAt: "2030-01-01T00:00:00Z" }, refetch: vi.fn() };
  } },
} } }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });
  state.query.mockClear();
  state.submit.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

async function render(game: FrontendGame, region: "intl" | "jp" = "intl") {
  await act(async () => root.render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <GameProvider game={game}><TokenDialog region={region} isOpen onOpenChange={() => {}} onTokenUpdate={state.submit} /></GameProvider>
    </NextIntlClientProvider>,
  ));
}

const games: FrontendGame[] = [
  { ...toFrontendGame(getGame("maimai"), ["intl", "jp"]), capabilities: ["scores"] },
  { ...toFrontendGame(getGame("chunithm"), ["intl", "jp"]), capabilities: ["scores"] },
];

it.each(games)("uses the $id cookie wizard, game-scoped OTP, and configured login page", async game => {
  state.loginPageUrl = game.id === "maimai" ? "https://maimaidx-eng.com/" : "https://chunithm-net-eng.com/mobile/";
  await render(game);
  const cookieOption = Array.from(document.querySelectorAll("button")).find(button => button.textContent?.includes(messages.tokenDialog.tokenTab));
  expect(cookieOption).toBeDefined();
  await act(async () => cookieOption?.click());
  expect(state.query).toHaveBeenCalledWith({ game: game.id });
  expect(document.body.textContent).toContain(`Login to ${game.brand.displayName} NET`);
  expect(document.body.textContent).toContain(state.loginPageUrl);
  const manual = Array.from(document.querySelectorAll("button")).find(button => button.textContent === messages.tokenDialog.step1.enterDirectly);
  await act(async () => manual?.click());
  const input = document.getElementById("token");
  expect(input).toBeInstanceOf(HTMLInputElement);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "clal=syntheticCookie");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => document.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(state.submit).toHaveBeenCalledWith("cookie://clal=syntheticCookie");
});

it("keeps CHUNITHM JP on SEGA credentials even when Intl cookies are configured", async () => {
  await render(games[1], "jp");
  expect(document.getElementById("username")).toBeInstanceOf(HTMLInputElement);
  expect(document.getElementById("password")).toBeInstanceOf(HTMLInputElement);
  expect(state.query).not.toHaveBeenCalled();
});
