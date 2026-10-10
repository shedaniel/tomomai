import { describe, expect, it } from "vitest";
import { FETCH_START_ERROR_STATUS } from "@/lib/games/fetch-error-codes";
import { buildOpenApiDocument } from "./openapi";

type Operation = {
  parameters?: { name: string; in: string; schema: { enum?: string[] } }[];
  responses: Record<string, {
    description: string;
    headers?: Record<string, unknown>;
    content?: { "application/json": { schema: { properties?: Record<string, { enum?: string[] }> } } };
  }>;
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
    for (const path of ["/api/v1/games/{game}/songs", "/api/v1/games/{game}/recents", "/api/v1/games/{game}/snapshots/{id}", "/api/v1/games/{game}/codes"]) {
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

    const fetch = operation("post", "/api/v1/games/{game}/fetch");
    for (const [code, { http }] of Object.entries(FETCH_START_ERROR_STATUS)) {
      expect(fetch.responses[String(http)].description).toContain(code);
    }
    expect(Object.keys(fetch.responses)).toEqual(expect.arrayContaining(["409", "412", "429", "503"]));
    expect(fetch.responses["429"].headers?.["Retry-After"]).toBeDefined();
    expect(fetch.responses["503"].headers?.["Retry-After"]).toBeDefined();
    expect(fetch.responses["412"].headers).toBeUndefined();

    const error = document.components.schemas.Error as { required: string[] };
    expect(error.required).toEqual(["error"]);

    const me = operation("get", "/api/v1/me");
    expect(me.responses["400"]).toBeUndefined();
    expect(me.responses["422"]).toBeUndefined();
    expect(me.parameters).toBeUndefined();
  });

  it("documents the shared rate limits on every route", () => {
    for (const [path, methods] of Object.entries(document.paths)) {
      for (const [method, op] of Object.entries(methods as Record<string, Operation>)) {
        expect(op.responses["429"]?.headers?.["Retry-After"], `${method} ${path}`).toBeDefined();
      }
    }
  });
});
