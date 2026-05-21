"use client";

import { useState } from "react";
import { Input } from "@tomomai/ui";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import { API_SCOPES, SCOPE_EXPANSIONS, SCOPE_IMPLIES, type ScopeKey } from "@/lib/api/scopes";
import { toast } from "sonner";
import { Copy, Check, AlertTriangle, ChevronRight, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

// ── Tree types & helpers ──────────────────────────────────────────────────────

export type TreeNode = { key: ScopeKey; children?: TreeNode[] };

export const SCOPE_TREE: TreeNode[] = [
  { key: "ready" },
  {
    key: "read",
    children: [
      { key: "user:metadata:read" },
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
    ],
  },
];

export const ALL_PARENT_KEYS = collectParents(SCOPE_TREE);

export const DEFAULT_SCOPES = new Set(
  (Object.entries(API_SCOPES) as [ScopeKey, (typeof API_SCOPES)[ScopeKey]][])
    .filter(([, s]) => s.default)
    .map(([k]) => k)
);

export function computeImplied(selected: Set<ScopeKey>): Set<ScopeKey> {
  const implied = new Set<ScopeKey>();
  const addImplied = (scope: ScopeKey) => {
    if (selected.has(scope) || implied.has(scope)) return;
    implied.add(scope);
    const scopeImplies = SCOPE_IMPLIES[scope];
    if (scopeImplies) for (const i of scopeImplies) addImplied(i);
  };
  for (const scope of selected) {
    const expansions = SCOPE_EXPANSIONS[scope];
    if (expansions) for (const leaf of expansions) addImplied(leaf);
    const scopeImplies = SCOPE_IMPLIES[scope];
    if (scopeImplies) for (const i of scopeImplies) addImplied(i);
  }
  return implied;
}

export function collectParents(nodes: TreeNode[], parents = new Set<ScopeKey>()): Set<ScopeKey> {
  for (const n of nodes) {
    if (n.children?.length) {
      parents.add(n.key);
      collectParents(n.children, parents);
    }
  }
  return parents;
}

export function hasAnyDescendantActive(
  node: TreeNode,
  selected: Set<ScopeKey>,
  implied: Set<ScopeKey>,
): boolean {
  if (selected.has(node.key) || implied.has(node.key)) return true;
  return node.children?.some((c) => hasAnyDescendantActive(c, selected, implied)) ?? false;
}

// ── CopyableInput ─────────────────────────────────────────────────────────────

export function CopyableInput({ value, ariaLabel }: { value: string; ariaLabel: string }) {
  const [copied, setCopied] = useState(false);
  const tc = useTranslations("common");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(tc("clipboardError"));
    }
  }

  return (
    <div className="relative">
      <Input readOnly value={value} className="font-mono text-sm pr-10" />
      <button
        onClick={handleCopy}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={ariaLabel}
      >
        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ── SaveWarning ───────────────────────────────────────────────────────────────

export function SaveWarning({ message }: { message: string }) {
  return (
    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {message}
    </p>
  );
}

// ── ScopeTreeNode ─────────────────────────────────────────────────────────────

export interface ScopeTreeNodeProps {
  node: TreeNode;
  selected: Set<ScopeKey>;
  expanded: Set<ScopeKey>;
  /** When provided, enables default/implied-scope logic (API key mode). */
  implied?: Set<ScopeKey>;
  onToggle: (key: ScopeKey) => void;
  onToggleExpanded: (key: ScopeKey) => void;
  idPrefix: string;
  scopeName: (key: ScopeKey) => string;
  scopeDescription: (key: ScopeKey) => string;
  badges: {
    bundle?: string;       // shown for expansion scopes when not in implied mode
    default?: string;      // shown for default scopes (implied mode)
    included?: string;     // shown for implied scopes (implied mode)
    sensitive?: string;
    destructive?: string;
  };
}

export function ScopeTreeNode({
  node,
  selected,
  expanded,
  implied,
  onToggle,
  onToggleExpanded,
  idPrefix,
  scopeName,
  scopeDescription,
  badges,
}: ScopeTreeNodeProps) {
  const def = API_SCOPES[node.key];
  const hasChildren = !!node.children?.length;
  const isExpanded = expanded.has(node.key);
  const isSelected = selected.has(node.key);
  const hasImpliedMode = implied !== undefined;

  const isDefault = hasImpliedMode && !!def.default;
  const isImplied = hasImpliedMode && !!implied?.has(node.key);
  const isDisabled = isDefault || isImplied;
  const isExpansion = node.key in SCOPE_EXPANSIONS;

  let checked: boolean | "indeterminate";
  if (isSelected || isImplied) {
    checked = true;
  } else if (hasChildren) {
    const anyActive = hasImpliedMode
      ? hasAnyDescendantActive(node, selected, implied!)
      : node.children!.some((c) => selected.has(c.key));
    checked = anyActive ? "indeterminate" : false;
  } else {
    checked = false;
  }

  return (
    <div>
      <div
        className={[
          "flex items-start gap-2 py-1.5 px-2 rounded-md transition-colors",
          !isDisabled ? "hover:bg-muted/50" : "",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggleExpanded(node.key)}
          className={[
            "mt-0.5 shrink-0 w-4 h-4 flex items-center justify-center",
            hasChildren ? "text-muted-foreground hover:text-foreground cursor-pointer" : "cursor-default",
          ].join(" ")}
          tabIndex={hasChildren ? 0 : -1}
          aria-hidden={!hasChildren}
        >
          {hasChildren && (isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)}
        </button>

        <Checkbox
          id={`${idPrefix}-${node.key}`}
          checked={checked}
          disabled={isDisabled}
          onCheckedChange={() => onToggle(node.key)}
          className={["mt-0.5 shrink-0", isImplied ? "opacity-50" : ""].join(" ")}
        />

        <label
          htmlFor={`${idPrefix}-${node.key}`}
          className={["flex-1 min-w-0", isDisabled ? "cursor-default" : "cursor-pointer"].join(" ")}
        >
          <div className="flex items-center gap-1.5 flex-wrap text-sm font-medium leading-snug">
            <span className={isImplied ? "text-muted-foreground" : ""}>{scopeName(node.key)}</span>
            {isDefault && badges.default && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{badges.default}</span>
            )}
            {isImplied && badges.included && (
              <span className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400 px-1.5 py-0.5 rounded">{badges.included}</span>
            )}
            {!hasImpliedMode && isExpansion && badges.bundle && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{badges.bundle}</span>
            )}
            {!isImplied && def.sensitive && badges.sensitive && (
              <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 px-1.5 py-0.5 rounded">{badges.sensitive}</span>
            )}
            {def.destructive && badges.destructive && (
              <span className="text-xs text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 px-1.5 py-0.5 rounded">{badges.destructive}</span>
            )}
          </div>
          <code className="text-[10px] font-mono text-muted-foreground/50 leading-none block mt-0.5">{node.key}</code>
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">{scopeDescription(node.key)}</p>
        </label>
      </div>

      {hasChildren && isExpanded && (
        <div className="ml-3 pl-3 border-l border-border/60">
          {node.children!.map((child) => (
            <ScopeTreeNode
              key={child.key}
              node={child}
              selected={selected}
              expanded={expanded}
              implied={implied}
              onToggle={onToggle}
              onToggleExpanded={onToggleExpanded}
              idPrefix={idPrefix}
              scopeName={scopeName}
              scopeDescription={scopeDescription}
              badges={badges}
            />
          ))}
        </div>
      )}
    </div>
  );
}
