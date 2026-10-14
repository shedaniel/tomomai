import { act } from "react";
import { vi } from "vitest";

/** Retries the assertion until it passes, letting React commit pending updates inside act before each try. */
export function waitForRender(assertion: () => void): Promise<void> {
  return vi.waitFor(async () => {
    await act(async () => {});
    assertion();
  });
}
