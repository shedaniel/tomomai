"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AnimatedDialog,
  AnimatedDialogContent,
} from "@/components/ui/animated-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select-friendly";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import { trpc } from "@/lib/trpc-client";
import { API_SCOPES, SCOPE_EXPANSIONS, SCOPE_IMPLIES, type ScopeKey } from "@/lib/api/scopes";
import { toast } from "sonner";
import {
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useTranslations } from "next-intl";

const EXPIRATION_VALUES = ["7d", "30d", "90d", "1y", "never"] as const;
type ExpirationValue = (typeof EXPIRATION_VALUES)[number];

const EXPIRATION_DAYS: Record<ExpirationValue, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
  "never": null,
};

type TreeNode = { key: ScopeKey; children?: TreeNode[] };

const SCOPE_TREE: TreeNode[] = [
  { key: "ready" },
  { key: "read" },
  { key: "user:metadata:read" },
  {
    // snapshot:all:read implies snapshot:latest:read (all ⊇ latest)
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
  {
    // recent:detailed:read implies recent:read
    key: "recent:read",
    children: [{ key: "recent:detailed:read" }],
  },
  { key: "stats:read" },
  {
    // album:images:read implies album:read
    key: "album:read",
    children: [{ key: "album:images:read" }],
  },
];

const ALL_PARENT_KEYS = new Set<ScopeKey>();
function collectParents(nodes: TreeNode[]) {
  for (const n of nodes) {
    if (n.children?.length) {
      ALL_PARENT_KEYS.add(n.key);
      collectParents(n.children);
    }
  }
}
collectParents(SCOPE_TREE);

function computeImplied(selected: Set<ScopeKey>): Set<ScopeKey> {
  const implied = new Set<ScopeKey>();
  const addImplied = (scope: ScopeKey) => {
    if (selected.has(scope) || implied.has(scope)) return;
    implied.add(scope);
    const scopeImplies = SCOPE_IMPLIES[scope];
    if (scopeImplies) for (const i of scopeImplies) addImplied(i);
  };
  for (const scope of selected) {
    const expansions = SCOPE_EXPANSIONS[scope];
    if (expansions) {
      for (const leaf of expansions) addImplied(leaf);
    }
    const scopeImplies = SCOPE_IMPLIES[scope];
    if (scopeImplies) for (const i of scopeImplies) addImplied(i);
  }
  return implied;
}

function hasAnyDescendantActive(
  node: TreeNode,
  selected: Set<ScopeKey>,
  implied: Set<ScopeKey>
): boolean {
  if (selected.has(node.key) || implied.has(node.key)) return true;
  return node.children?.some((c) => hasAnyDescendantActive(c, selected, implied)) ?? false;
}

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateApiKeyDialogProps) {
  const t = useTranslations("settings.developer");
  const tc = useTranslations("common");

  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Set<ScopeKey>>(
    new Set(
      (Object.entries(API_SCOPES) as [ScopeKey, (typeof API_SCOPES)[ScopeKey]][])
        .filter(([, s]) => s.default)
        .map(([k]) => k)
    )
  );
  const [expandedNodes, setExpandedNodes] = useState<Set<ScopeKey>>(
    new Set(ALL_PARENT_KEYS)
  );
  const [expiration, setExpiration] = useState<ExpirationValue>("never");
  const [understandText, setUnderstandText] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const confirmPhrase = t("createDialog.confirmPhrase");

  const createMutation = trpc.developer.createApiKey.useMutation({
    onSuccess: (data) => {
      setCreatedKey(data.key);
      onCreated();
    },
    onError: (err) => {
      toast.error(err.message ?? t("createDialog.createError"));
    },
  });

  const hasDestructive = Array.from(selectedScopes).some(
    (k) => API_SCOPES[k].destructive
  );
  const hasSensitive = Array.from(selectedScopes).some(
    (k) => API_SCOPES[k].sensitive
  );
  const understandConfirmed = !hasDestructive || understandText === confirmPhrase;
  const canCreate = name.trim() && understandConfirmed && !createMutation.isPending;

  function toggleScope(scope: ScopeKey) {
    if (API_SCOPES[scope].default) return;
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  }

  function toggleExpanded(key: ScopeKey) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function handleCreate() {
    if (!canCreate) return;
    const days = EXPIRATION_DAYS[expiration];
    createMutation.mutate({
      name: name.trim(),
      scopes: Array.from(selectedScopes),
      expiresIn: days != null ? days * 86400 : undefined,
    });
  }

  async function handleCopy() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(tc("clipboardError"));
    }
  }

  function handleClose() {
    setName("");
    setSelectedScopes(
      new Set(
        (Object.entries(API_SCOPES) as [ScopeKey, (typeof API_SCOPES)[ScopeKey]][])
          .filter(([, s]) => s.default)
          .map(([k]) => k)
      )
    );
    setExpandedNodes(new Set(ALL_PARENT_KEYS));
    setExpiration("never");
    setUnderstandText("");
    setCreatedKey(null);
    setCopied(false);
    onOpenChange(false);
  }

  const implied = computeImplied(selectedScopes);

  function renderNode(node: TreeNode, depth: number) {
    const scope = API_SCOPES[node.key];
    const isDefault = scope.default;
    const isImplied = implied.has(node.key);
    const isSelected = selectedScopes.has(node.key);
    const hasChildren = !!node.children?.length;
    const isExpanded = expandedNodes.has(node.key);

    let checked: boolean | "indeterminate";
    if (isSelected || isImplied) {
      checked = true;
    } else if (hasChildren && hasAnyDescendantActive(node, selectedScopes, implied)) {
      checked = "indeterminate";
    } else {
      checked = false;
    }

    const isDisabled = isDefault || isImplied;

    return (
      <div key={node.key}>
        <div
          className={[
            "flex items-start gap-2 py-1.5 px-2 rounded-md transition-colors",
            !isDisabled ? "hover:bg-muted/50" : "",
          ].join(" ")}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggleExpanded(node.key)}
            className={[
              "mt-0.5 shrink-0 w-4 h-4 flex items-center justify-center",
              hasChildren
                ? "text-muted-foreground hover:text-foreground cursor-pointer"
                : "cursor-default",
            ].join(" ")}
            tabIndex={hasChildren ? 0 : -1}
            aria-hidden={!hasChildren}
          >
            {hasChildren &&
              (isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              ))}
          </button>

          <Checkbox
            id={`scope-${node.key}`}
            checked={checked}
            disabled={isDisabled}
            onCheckedChange={() => toggleScope(node.key)}
            className={["mt-0.5 shrink-0", isImplied ? "opacity-50" : ""].join(" ")}
          />

          <label
            htmlFor={`scope-${node.key}`}
            className={[
              "flex-1 min-w-0",
              isDisabled ? "cursor-default" : "cursor-pointer",
            ].join(" ")}
          >
            <div className="flex items-center gap-1.5 flex-wrap text-sm font-medium leading-snug">
              <span className={isImplied ? "text-muted-foreground" : ""}>
                {t(`scopes.${node.key}.name`)}
              </span>
              {isDefault && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {t("createDialog.scopeDefaultBadge")}
                </span>
              )}
              {isImplied && (
                <span className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400 px-1.5 py-0.5 rounded">
                  {t("createDialog.scopeIncludedBadge")}
                </span>
              )}
              {!isImplied && scope.sensitive && (
                <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 px-1.5 py-0.5 rounded">
                  {t("createDialog.scopeSensitiveBadge")}
                </span>
              )}
              {scope.destructive && (
                <span className="text-xs text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 px-1.5 py-0.5 rounded">
                  {t("createDialog.scopeDestructiveBadge")}
                </span>
              )}
            </div>
            <code className="text-[10px] font-mono text-muted-foreground/50 leading-none block mt-0.5">
              {node.key}
            </code>
            <p className="text-xs text-muted-foreground leading-snug mt-0.5">
              {t(`scopes.${node.key}.description`)}
            </p>
          </label>
        </div>

        {hasChildren && isExpanded && (
          <div className="ml-3 pl-3 border-l border-border/60">
            {node.children!.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <AnimatedDialog open={open} onOpenChange={handleClose}>
      <AnimatedDialogContent className="sm:max-w-lg">
        {createdKey ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("createDialog.createdTitle")}</DialogTitle>
              <DialogDescription>
                {t("createDialog.createdDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative">
                <Input
                  readOnly
                  value={createdKey}
                  className="font-mono text-sm pr-10"
                />
                <button
                  onClick={handleCopy}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t("createDialog.copyAriaLabel")}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t("createDialog.saveWarning")}
              </p>
              <div className="flex justify-end">
                <Button onClick={handleClose}>{t("createDialog.done")}</Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("createDialog.title")}</DialogTitle>
              <DialogDescription>
                {t("createDialog.description")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="key-name">{t("createDialog.nameLabel")}</Label>
                <Input
                  id="key-name"
                  placeholder={t("createDialog.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  {t("createDialog.nameDescription")}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{t("createDialog.scopesLabel")}</Label>
                <div className="border rounded-md">
                  <div className="max-h-128 overflow-y-auto p-1">
                    {SCOPE_TREE.map((node) => renderNode(node, 0))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiration">
                  {t("createDialog.expirationLabel")}
                </Label>
                <Select
                  value={expiration}
                  onValueChange={(v) => setExpiration(v as ExpirationValue)}
                >
                  <SelectTrigger id="expiration" className="bg-background w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent label={t("createDialog.expirationLabel")}>
                    {EXPIRATION_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`createDialog.expiration.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {hasSensitive && !hasDestructive && (
                <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {t("createDialog.sensitiveWarning")}
                  </p>
                </div>
              )}

              {hasDestructive && (
                <div className="space-y-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {t("createDialog.destructiveWarning")}
                  </p>
                  <Label
                    htmlFor="understand"
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    {t("createDialog.confirmLabelPre")}{" "}
                    <span className="font-mono font-bold">{confirmPhrase}</span>{" "}
                    {t("createDialog.confirmLabelPost")}
                  </Label>
                  <Textarea
                    id="understand"
                    value={understandText}
                    onChange={(e) => setUnderstandText(e.target.value)}
                    placeholder={confirmPhrase}
                    rows={2}
                    className="resize-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose}>
                  {tc("cancel")}
                </Button>
                <Button onClick={handleCreate} disabled={!canCreate}>
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t("createDialog.creating")}
                    </>
                  ) : (
                    t("createDialog.createButton")
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </AnimatedDialogContent>
    </AnimatedDialog>
  );
}
