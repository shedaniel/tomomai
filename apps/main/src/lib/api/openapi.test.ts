import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "./openapi";

type Operation = {
  parameters?: { name: string; in: string; schema: { enum?: string[] } }[];
  responses: Record<string, { description: string; content?: { "application/json": { schema: { properties?: Record<string, { enum?: string[] }> } } } }>;
};

const document = buildOpenApiDocument("https://example.test");
const operation = (method: string, path: string) => (document.paths[path] as Record<string, Operation>)[method];
const gameParam = (op: Operation) => op.parameters?.find(p => p.name === "game" && p.in === "path")?.schema.enum;

describe("OpenAPI document", () => {
  it("lists only the games that offer each game route's capability", () => {
    for (const path of ["/api/v1/games/{game}/albums", "/api/v1/games/{game}/plates", "/api/v1/games/{game}/stats"]) {
      expect(gameParam(operation("get", path))).toEqual(["maimai"]);
      expect(operation("get", path).responses["200"].content?.["application/json"].schema.properties?.game.enum).toEqual(["maimai"]);
    }
    for (const path of ["/api/v1/games/{game}/songs", "/api/v1/games/{game}/recents", "/api/v1/games/{game}/snapshots/{id}"]) {
      expect(gameParam(operation("get", path))).toEqual(["maimai", "chunithm"]);
    }
  });

  it("documents redirects and game errors from the spec", () => {
    for (const path of ["/api/v1/games/{game}/songs", "/api/v1/games/{game}/parents"]) {
      expect(operation("get", path).responses["302"]).toBeDefined();
    }
    for (const path of ["/api/v1/games/{game}/songs/versions", "/api/v1/games/{game}/songs/{id}", "/api/v1/games/{game}/albums"]) {
      expect(operation("get", path).responses["302"]).toBeUndefined();
    }

    const albums = operation("get", "/api/v1/games/{game}/albums");
    expect(albums.responses["400"].description).toContain("INVALID_PARAMETER or UNKNOWN_GAME or UNSUPPORTED_REGION");
    expect(albums.responses["422"].description).toContain("GAME_NOT_ENABLED or UNSUPPORTED_CAPABILITY");

    const me = operation("get", "/api/v1/me");
    expect(me.responses["400"]).toBeUndefined();
    expect(me.responses["422"]).toBeUndefined();
    expect(me.parameters).toBeUndefined();
  });
});
