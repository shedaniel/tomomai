import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * AsyncLocalStorage-based hierarchical profiler. Each `span()` call appends a
 * node to its parent and runs the work inside a fresh ALS context, so
 * concurrent (Promise.all) spans don't trample each other.
 *
 * When `enterProfile` was never called, `span()` is a transparent pass-through
 * with no allocation — safe to leave in hot code paths permanently.
 */

export interface ProfileNode {
  name: string;
  startMs: number;
  durationMs: number;
  children: ProfileNode[];
}

interface Store {
  current: ProfileNode;
}

const als = new AsyncLocalStorage<Store>();

export async function enterProfile<T>(rootName: string, fn: () => Promise<T>): Promise<{ result: T; root: ProfileNode }> {
  const root: ProfileNode = { name: rootName, startMs: performance.now(), durationMs: 0, children: [] };
  try {
    const result = await als.run({ current: root }, fn);
    return { result, root };
  } finally {
    root.durationMs = performance.now() - root.startMs;
  }
}

export async function span<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const store = als.getStore();
  if (!store) return await fn();
  const node: ProfileNode = { name, startMs: performance.now(), durationMs: 0, children: [] };
  store.current.children.push(node);
  try {
    return await als.run({ current: node }, fn);
  } finally {
    node.durationMs = performance.now() - node.startMs;
  }
}

export function formatProfileTree(root: ProfileNode): string {
  const lines: string[] = [];
  function visit(node: ProfileNode, prefix: string, isLast: boolean, isRoot: boolean) {
    const connector = isRoot ? '' : (isLast ? '└─ ' : '├─ ');
    const childrenSum = node.children.reduce((s, c) => s + c.durationMs, 0);
    const self = Math.max(0, node.durationMs - childrenSum);
    const selfText = node.children.length > 0 ? ` (self ${self.toFixed(1)}ms)` : '';
    lines.push(`${prefix}${connector}${node.name}  ${node.durationMs.toFixed(1)}ms${selfText}`);
    const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ');
    for (let i = 0; i < node.children.length; i++) {
      visit(node.children[i], childPrefix, i === node.children.length - 1, false);
    }
  }
  visit(root, '', true, true);
  return lines.join('\n');
}
