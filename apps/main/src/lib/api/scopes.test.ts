import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { locales } from "@/i18n/locale";
import { API_SCOPES, type ScopeKey } from "./scopes";
import { routesByScope } from "./specs";

type ScopeCopy = Partial<Record<ScopeKey, { name?: string; description?: string }>>;

function scopeCopy(locale: string): ScopeCopy {
  const messages = JSON.parse(readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), "utf8"));
  return messages.settings.developer.scopes;
}

describe("API scopes", () => {
  it("lists the routes each scope grants from the route specs", () => {
    const routes = routesByScope();
    expect(routes.ready).toEqual(expect.arrayContaining(["GET /api/v1/ok", "GET /api/v1/me/scopes"]));
    expect(routes["fetch:delete"]).toEqual(["DELETE /api/v1/games/{game}/fetch/token"]);
    expect(routes["snapshot:all:metadata:read"]).toEqual(["GET /api/v1/games/{game}/snapshots", "GET /api/v1/games/{game}/snapshots/{id}"]);
    expect(routes.read).toBeUndefined();
  });

  it.each(locales)("leaves route lists out of the hand-written %s scope copy", locale => {
    const described = Object.entries(scopeCopy(locale)).filter(([, copy]) => /\/api\//.test(copy?.description ?? ""));
    expect(described.map(([scope]) => scope)).toEqual([]);
  });

  it("describes each scope in the English settings exactly as the scope table does", () => {
    const english = scopeCopy("en");
    for (const [scope, { name, description }] of Object.entries(API_SCOPES)) {
      expect(english[scope as ScopeKey], scope).toEqual({ name, description });
    }
  });
});
