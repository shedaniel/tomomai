// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameProvider } from "@/components/providers/game-provider";
import { useFetchSession } from "./useFetchSession";

const transport = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: { user: {
    getLatestFetchSessionId: { useQuery: () => ({ data: undefined }) },
    startFetch: { useMutation: () => ({ mutateAsync: transport.start, isPending: false }) },
  } },
  trpcClient: {},
}));

let result: ReturnType<typeof useFetchSession>;
let root: Root;
function Probe() {
  result = useFetchSession();
  return <span role="status">{result.fetchError}</span>;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  transport.start.mockReset().mockResolvedValue({ sessionId: "test-session" });
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
