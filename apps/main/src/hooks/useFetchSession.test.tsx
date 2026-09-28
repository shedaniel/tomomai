// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameProvider } from "@/components/providers/game-provider";
import { useFetchSession } from "./useFetchSession";

const transport = vi.hoisted(() => ({ start: vi.fn(), status: vi.fn() }));
const callbacks = { complete: vi.fn(), token: vi.fn() };
vi.mock("@/lib/trpc-client", () => ({
  trpc: { user: {
    getLatestFetchSessionId: { useQuery: () => ({ data: undefined }) },
    startFetch: { useMutation: (options: { onSuccess: (data: { sessionId: string }, variables: { region: "intl" }) => void }) => ({
      mutateAsync: async (input: { region: "intl" }) => {
        const response = await transport.start(input);
        options.onSuccess(response, input);
        return response;
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
  const session = useFetchSession(callbacks.complete, callbacks.token);
  capture(session);
  return <span role="status">{session.fetchError}</span>;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  transport.start.mockReset().mockResolvedValue({ sessionId: "test-session" });
  transport.status.mockReset().mockResolvedValue({ id: "test-session", status: "pending", startedAt: new Date() });
  callbacks.complete.mockReset();
  callbacks.token.mockReset();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  vi.useRealTimers();
});

it("reports maintenance before submitting a token and allows retry after the window", async () => {
  const container = document.createElement("div");
  root = createRoot(container);
  vi.setSystemTime(new Date("2026-09-08T20:00:00Z"));
  await act(async () => root.render(
    <GameProvider game={{ id: "chunithm", displayName: "CHUNITHM", productName: "tomochu", enabled: true, fetchConfigured: true, regions: ["intl"], capabilities: ["scores"] }}>
      <Probe />
    </GameProvider>,
  ));
  await act(async () => {
    await expect(result.startDataFetch("intl", "test-cookie")).rejects.toThrow("04:00 - 07:00 JST");
  });
  expect(container.textContent).toContain("maintenance window (04:00 - 07:00 JST)");
  expect(transport.start).not.toHaveBeenCalled();

  vi.setSystemTime(new Date("2026-09-08T22:00:00Z"));
  await act(async () => result.startDataFetch("intl", "test-cookie"));
  expect(transport.start).toHaveBeenCalledWith({ game: "chunithm", region: "intl", token: "test-cookie" });
  expect(container.textContent).toBe("");
});

it("keeps subscription failures out of credential recovery and completion refresh", async () => {
  const container = document.createElement("div");
  root = createRoot(container);
  vi.setSystemTime(new Date("2026-09-08T22:00:00Z"));
  const errorMessage = "SUBSCRIPTION_REQUIRED: CHUNITHM JP requires an active ゲキチュウマイ-NET subscription.";
  transport.status.mockResolvedValue({
    id: "test-session", status: "failed", startedAt: new Date(), errorMessage,
  });
  await act(async () => root.render(
    <GameProvider game={{ id: "chunithm", displayName: "CHUNITHM", productName: "tomochu", enabled: true, fetchConfigured: true, regions: ["jp"], capabilities: ["scores"] }}>
      <Probe />
    </GameProvider>,
  ));
  await act(async () => result.startDataFetch("jp"));
  expect(result.fetchToastState?.errorMessage).toBe(errorMessage);
  expect(result.currentSession?.status).toBe("failed");
  expect(callbacks.token).not.toHaveBeenCalled();
  expect(callbacks.complete).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(10_000));
  expect(transport.status).toHaveBeenCalledTimes(1);
});
