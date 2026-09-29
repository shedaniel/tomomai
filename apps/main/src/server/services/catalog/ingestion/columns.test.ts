import { getTableColumns } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { songs } from "@/lib/db/schema-pg";
import { excludedSet, INSTANCE_UPDATE_COLUMNS } from "./columns";

describe("instance upsert columns", () => {
  it("takes every instance column from the conflicting row by its quoted database name", () => {
    const set = excludedSet(songs, INSTANCE_UPDATE_COLUMNS);
    const dialect = new PgDialect();
    expect(Object.fromEntries(Object.entries(set).map(([column, value]) => [column, dialect.sqlToQuery(value).sql]))).toEqual({
      level: 'excluded."level"', levelPrecise: 'excluded."levelPrecise"', addedVersion: 'excluded."addedVersion"',
      noteDesigner: 'excluded."noteDesigner"', metadata: 'excluded."metadata"', tapCount: 'excluded."tapCount"',
      holdCount: 'excluded."holdCount"', slideCount: 'excluded."slideCount"', touchCount: 'excluded."touchCount"',
      breakCount: 'excluded."breakCount"',
    });
  });

  it("replaces every songs column except the instance identity", () => {
    const identity = ["id", "parentId", "game", "region", "gameVersion"];
    expect([...INSTANCE_UPDATE_COLUMNS].toSorted())
      .toEqual(Object.keys(getTableColumns(songs)).filter(column => !identity.includes(column)).toSorted());
  });
});
