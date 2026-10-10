import { describe, expect, it } from "vitest";
import { API_SCOPES, isInternalScope, type ScopeKey } from "./scopes";
import { grantedScopeTree, SCOPE_TREE, type TreeNode } from "./scope-tree";

function keys(nodes: TreeNode[]): ScopeKey[] {
  return nodes.flatMap((n) => [n.key, ...keys(n.children ?? [])]);
}

describe("scope tree", () => {
  it("places every public scope, so developers can pick it and users see it on consent", () => {
    const placed = new Set(keys(SCOPE_TREE));
    const missing = (Object.keys(API_SCOPES) as ScopeKey[]).filter((k) => !isInternalScope(k) && !placed.has(k));
    expect(missing).toEqual([]);
  });

  it("keeps only granted scopes, grouped under their umbrella, and never drops one it cannot place", () => {
    const tree = grantedScopeTree(["stats:read", "album:images:read", "fetch:delete", "snapshot:submit"]);
    expect(tree).toEqual([
      { key: "read", children: [{ key: "stats:read" }, { key: "album:read", children: [{ key: "album:images:read" }] }] },
      { key: "fetch:delete" },
      { key: "snapshot:submit" },
    ]);
  });
});
