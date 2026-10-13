import { describe, expect, it } from "vitest";
import { z } from "zod";
import { responseTypeName, toTypeScript, toZod } from "./schema-codegen";

const schema = z.toJSONSchema(
  z.object({
    username: z.string().nullable(),
    region: z.enum(["intl", "jp"]).describe("Primary region"),
    plays: z.int(),
    tags: z.array(z.object({ name: z.string(), hidden: z.boolean().optional() })),
  }),
  { target: "draft-2020-12" },
) as Record<string, unknown>;

describe("schema codegen", () => {
  it("renders a TypeScript interface with optional, nullable and enum fields", () => {
    expect(toTypeScript(schema, "GetMeResponse")).toBe(
      [
        "export interface GetMeResponse {",
        "  username: string | null;",
        "  /** Primary region */",
        '  region: "intl" | "jp";',
        "  plays: number;",
        "  tags: {",
        "    name: string;",
        "    hidden?: boolean;",
        "  }[];",
        "}",
      ].join("\n"),
    );
  });

  it("renders the matching Zod source and its inferred type", () => {
    expect(toZod(schema, "GetMeResponse")).toBe(
      [
        'import { z } from "zod";',
        "",
        "export const GetMeResponse = z.object({",
        "  username: z.string().nullable(),",
        "  /** Primary region */",
        '  region: z.enum(["intl", "jp"]),',
        "  plays: z.int(),",
        "  tags: z.array(z.object({",
        "    name: z.string(),",
        "    hidden: z.boolean().optional(),",
        "  })),",
        "});",
        "",
        "export type GetMeResponse = z.infer<typeof GetMeResponse>;",
      ].join("\n"),
    );
  });

  it("parenthesises a union before [] so it stays an array of either shape", () => {
    const plays = z.toJSONSchema(
      z.array(z.union([z.object({ a: z.string() }), z.object({ b: z.number() })])),
      { target: "draft-2020-12" },
    ) as Record<string, unknown>;
    expect(toTypeScript(plays, "Plays")).toBe(
      "export type Plays = ({\n  a: string;\n} | {\n  b: number;\n})[];",
    );
  });

  it("names the type after the route", () => {
    expect(responseTypeName("get-me-scopes")).toBe("GetMeScopesResponse");
  });
});
