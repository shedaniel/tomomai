import type { ScopeKey } from "@/lib/api/scopes";

export type TreeNode = { key: ScopeKey; children?: TreeNode[] };

/** How scopes nest for display. Every public scope must appear here (enforced by scope-tree.test.ts). */
export const SCOPE_TREE: TreeNode[] = [
  { key: "ready" },
  {
    key: "read",
    children: [
      { key: "user:metadata:read" },
      { key: "user:settings:read" },
      {
        key: "snapshot:all:read",
        children: [
          { key: "snapshot:all:metadata:read" },
          { key: "snapshot:all:songs:b50:read" },
          { key: "snapshot:all:songs:read" },
          { key: "snapshot:all:events:read" },
          { key: "snapshot:all:icon:read" },
        ],
      },
      {
        key: "snapshot:latest:read",
        children: [
          { key: "snapshot:latest:metadata:read" },
          { key: "snapshot:latest:songs:b50:read" },
          { key: "snapshot:latest:songs:read" },
          { key: "snapshot:latest:events:read" },
          { key: "snapshot:latest:icon:read" },
        ],
      },
      { key: "recent:read", children: [{ key: "recent:detailed:read" }] },
      { key: "stats:read" },
      { key: "album:read", children: [{ key: "album:images:read" }] },
      { key: "plate:read" },
      { key: "fetch:read" },
    ],
  },
  { key: "fetch:start" },
  { key: "fetch:delete" },
  { key: "snapshot:all:delete" },
];

export function collectParents(nodes: TreeNode[], parents = new Set<ScopeKey>()): Set<ScopeKey> {
  for (const n of nodes) {
    if (n.children?.length) {
      parents.add(n.key);
      collectParents(n.children, parents);
    }
  }
  return parents;
}

export const ALL_PARENT_KEYS = collectParents(SCOPE_TREE);

/**
 * The tree cut down to the granted scopes. A node stays when it or a descendant is granted, so
 * umbrella scopes that are never stored still group their granted leaves. Granted scopes the tree
 * does not place are appended at the top level, so nothing granted can go unshown.
 */
export function grantedScopeTree(granted: Iterable<ScopeKey>, tree: TreeNode[] = SCOPE_TREE): TreeNode[] {
  const grantedSet = new Set(granted);
  const placed = new Set<ScopeKey>();
  const prune = (nodes: TreeNode[]): TreeNode[] =>
    nodes.flatMap((node) => {
      const children = prune(node.children ?? []);
      if (grantedSet.has(node.key)) placed.add(node.key);
      else if (children.length === 0) return [];
      return [children.length ? { key: node.key, children } : { key: node.key }];
    });
  const pruned = prune(tree);
  return [...pruned, ...[...grantedSet].filter((k) => !placed.has(k)).map((key) => ({ key }))];
}
