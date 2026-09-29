// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameProvider } from "@/components/providers/game-provider";
import { toFrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import { useFetchSession } from "./useFetchSession";

const transport = vi.hoisted(() => ({ start: vi.fn(), status: vi.fn() }));
const callbacks = { complete: vi.fn(), token: vi.fn(), album: vi.fn(), cnCookies: vi.fn() };
type MutationOptions = {
  onSuccess: (data: { sessionId: string }, variables: { region: "intl" }) => void;
  onError: (error: Error) => void;
};
vi.mock("@/lib/trpc-client", () => ({
  trpc: { user: {
    getLatestFetchSessionId: { useQuery: () => ({ data: undefined }) },
    startFetch: { useMutation: (options: MutationOptions) => ({
      mutateAsync: async (input: { region: "intl" }) => {
        try {
          const response = await transport.start(input);
          options.onSuccess(response, input);
          return response;
        } catch (error) {
          options.onError(error as Error);
          throw error;
        }
      },
      isPending: false,
    }) },
  } },
  trpcClient: { user: { getFetchStatus: { query: transport.status } } },
}));

let result: ReturnType<typeof useFetchSession>;
let root: Root;
const capture = (session: ReturnType<typeof useFetchSession>) => { result = session; };
function Probe() {
  const session = useFetchSession(callbacks.complete, callbacks.token, callbacks.album, callbacks.cnCookies);
  capture(session);
  return <span role="status">{session.fetchError}</span>;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  transport.start.mockReset().mockResolvedValue({ sessionId: "test-session" });
  transport.status.mockReset().mockResolvedValue({ id: "test-session", status: "pending", startedAt: new Date() });
  for (const callback of Object.values(callbacks)) callback.mockReset();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  vi.useRealTimers();
});

async function renderProbe(region: "intl" | "jp") {
  const container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(
    <GameProvider game={{ ...toFrontendGame(getGame("chunithm"), [region]), capabilities: ["scores"] }}>
      <Probe />
    </GameProvider>,
  ));
  return container;
}

it("shows the server's maintenance refusal and lets the user retry after the window", async () => {
  const container = await renderProbe("intl");
  const refusal = "MAINTENANCE: Cannot fetch data during maintenance window (04:00 - 07:00 JST)";
  transport.start.mockRejectedValueOnce(new Error(refusal));
  await act(async () => {
    await expect(result.startDataFetch("intl", "test-cookie")).rejects.toThrow(refusal);
  });
  expect(container.textContent).toBe(refusal);
  expect(callbacks.token).not.toHaveBeenCalled();

  await act(async () => result.startDataFetch("intl", "test-cookie"));
  expect(transport.start).toHaveBeenLastCalledWith({ game: "chunithm", region: "intl", token: "test-cookie" });
  expect(container.textContent).toBe("");
});

it("routes coded start refusals to their recovery dialogs", async () => {
  await renderProbe("intl");
  transport.start.mockRejectedValueOnce(new Error("NO_USE_ALBUMS_SETTINGS: No fetch albums settings preference set."));
  await act(async () => {
    await expect(result.startDataFetch("intl")).rejects.toThrow();
  });
  expect(callbacks.album).toHaveBeenCalledOnce();
  expect(result.fetchError).toBeNull();

  transport.start.mockRejectedValueOnce(new Error("CN_COOKIES_SINGLE_USE: This session token is single-use."));
  await act(async () => {
    await expect(result.startDataFetch("intl")).rejects.toThrow();
  });
  expect(callbacks.cnCookies).toHaveBeenCalledOnce();
});

it("keeps subscription failures out of credential recovery and completion refresh", async () => {
  const errorMessage = "SUBSCRIPTION_REQUIRED: CHUNITHM JP requires an active ゲキチュウマイ-NET subscription.";
  transport.status.mockResolvedValue({
    id: "test-session", status: "failed", startedAt: new Date(), errorMessage,
  });
  await renderProbe("jp");
  await act(async () => result.startDataFetch("jp"));
  expect(result.fetchToastState?.errorMessage).toBe(errorMessage);
  expect(result.currentSession?.status).toBe("failed");
  expect(callbacks.token).not.toHaveBeenCalled();
  expect(callbacks.complete).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(10_000));
  expect(transport.status).toHaveBeenCalledTimes(1);
});
