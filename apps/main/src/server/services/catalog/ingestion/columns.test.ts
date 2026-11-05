import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { songs } from "@/lib/db/schema-pg";
import { INSTANCE_UPDATE_COLUMNS } from "./columns";

describe("instance upsert columns", () => {
  it("replaces every songs column except the instance identity", () => {
    const identity = ["id", "parentId", "game", "region", "gameVersion"];
    expect([...INSTANCE_UPDATE_COLUMNS].toSorted())
      .toEqual(Object.keys(getTableColumns(songs)).filter(column => !identity.includes(column)).toSorted());
  });
});
