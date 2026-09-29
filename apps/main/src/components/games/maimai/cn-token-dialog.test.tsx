// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameProvider } from "@/components/providers/game-provider";
import { useFetchSession } from "@/hooks/useFetchSession";
import { toFrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import messages from "../../../../messages/en.json";
import { HttpProxyAuthSubDialog } from "./cn-token-dialog";

const EARLIER_SESSION = { id: "earlier-session", startedAt: "2026-09-29T00:00:00Z" };
const state = vi.hoisted(() => ({
  latestSession: { id: "", startedAt: "" },
  link: { data: { url: "https://proxy.test/auth" }, mutate: () => {}, reset: () => {}, isPending: false, error: null },
  authorized: vi.fn(),
  openChange: vi.fn(),
  status: vi.fn(),
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    user: {
      getLatestFetchSessionId: { useQuery: () => ({ data: state.latestSession }) },
      startFetch: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
    maimai: {
      getCnProxyConfigured: { useQuery: () => ({ data: { configured: false }, isLoading: false }) },
      getCnProxyAuthLink: { useMutation: () => state.link },
    },
  },
  trpcClient: { user: { getFetchStatus: { query: state.status } } },
}));
vi.mock("@/components/material-qr-code", () => ({ MaterialQRCode: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function Dashboard() {
  const { startSessionPolling, stopSessionPolling } = useFetchSession();
  return (
    <HttpProxyAuthSubDialog
      isOpen
      onOpenChange={open => state.openChange(open)}
      onAuthorized={() => state.authorized()}
      startSessionPolling={startSessionPolling}
      stopSessionPolling={stopSessionPolling}
    />
  );
}

let root: Root;
const render = () => act(async () => root.render(
  <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
    <GameProvider game={toFrontendGame(getGame("maimai"), ["cn"])}><Dashboard /></GameProvider>
  </NextIntlClientProvider>,
));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });
  vi.spyOn(console, "log").mockImplementation(() => {});
  state.latestSession = EARLIER_SESSION;
  state.authorized.mockReset();
  state.openChange.mockReset();
  state.status.mockReset().mockResolvedValue(null);
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("closes once the session started by the proxy callback appears, even though the parent re-renders with it", async () => {
  await render();
  await render();
  expect(state.authorized).not.toHaveBeenCalled();

  state.latestSession = { id: "proxy-session", startedAt: "2026-09-29T00:01:00Z" };
  await render();
  expect(state.openChange).toHaveBeenCalledWith(false);
  expect(state.authorized).toHaveBeenCalledOnce();
});
