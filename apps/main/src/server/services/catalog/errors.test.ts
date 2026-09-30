import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { formatCatalogError } from "./errors";

describe("formatCatalogError", () => {
  it.each([
    { name: "driver parameter limit", cause: Object.assign(new Error("Max number of parameters exceeded"), { code: "MAX_PARAMETERS_EXCEEDED" }), expected: "[MAX_PARAMETERS_EXCEEDED] Max number of parameters exceeded" },
    {
      name: "Postgres constraint",
      cause: Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505", constraint_name: "parent_song_publicId_unique", detail: "Key value: secret-detail" }),
      expected: "[23505] duplicate key value violates unique constraint (constraint: parent_song_publicId_unique)",
    },
    { name: "absent database cause", cause: undefined, expected: "Database query failed" },
  ])("reports the $name without the query, its parameters or row details", ({ cause, expected }) => {
    const error = new DrizzleQueryError(`insert into parent_song ${"secret-sql ".repeat(1000)}`, ["secret-parameter"], cause);
    expect(formatCatalogError(error)).toBe(expected);
  });

  it("keeps an ordinary error's message", () => {
    expect(formatCatalogError(new Error("Ambiguous catalog identity: Example"))).toBe("Ambiguous catalog identity: Example");
  });
});
