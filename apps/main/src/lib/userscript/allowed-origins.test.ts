import { expect, it } from "vitest";
import { USERSCRIPT_ALLOWED_ORIGINS } from "./allowed-origins";

it("lets the userscript run only on the maimai JP and International NETs", () => {
  expect(USERSCRIPT_ALLOWED_ORIGINS).toEqual(["https://maimaidx.jp", "https://maimaidx-eng.com"]);
});
