import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { API_ERROR_CODES } from "./error-codes";
import { getRegistry } from "./specs";

const guide = readFileSync(new URL("../../../content/developer/guides/errors.mdx", import.meta.url), "utf8");

describe("API error codes", () => {
  it("renders every code in the errors guide from the tables", () => {
    expect(guide).toContain("<ErrorCodes />");
    expect(guide).toContain("<RouteErrorCodes />");
  });

  it("explains the status of every code in the errors guide", () => {
    const explained = new Set([...guide.matchAll(/^\| `(\d{3})` \|/gm)].map(([, status]) => Number(status)));
    const statuses = [...API_ERROR_CODES, ...getRegistry().flatMap(route => route.errors ?? [])].map(error => error.status);
    expect(statuses.filter(status => !explained.has(status))).toEqual([]);
  });
});
