import { defineGameRoute } from "@/lib/api/registry";
import { codeTable } from "@/lib/api/schemas";

export const spec = defineGameRoute({
  method: "GET",
  path: "/api/v1/games/{game}/codes",
  tag: "Codes",
  summary: "List the game's integer codes",
  description:
    "Chart difficulties, chart types and score statuses appear as integer codes in every response. " +
    "This lists the keys of each kind in code order, so the code of a key is its index. " +
    "Codes are only ever appended, so a cached copy stays valid for the codes it lists.",
  scope: "public",
  capability: "catalog",
  cost: 1,
  cacheSeconds: 86400,
  response: codeTable,
});
