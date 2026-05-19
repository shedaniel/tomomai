"use client";

import { useState } from "react";
import { Button } from "@tomomai/ui";
import { Input } from "@tomomai/ui";
import { Label } from "@tomomai/ui";
import { Textarea } from "@tomomai/ui";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@tomomai/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tomomai/ui/select-friendly";
import { trpc } from "@/lib/trpc-client";
import { API_SCOPES, type ScopeKey } from "@/lib/api/scopes";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  SCOPE_TREE,
  ALL_PARENT_KEYS,
  DEFAULT_SCOPES,
  computeImplied,
  CopyableInput,
  SaveWarning,
  ScopeTreeNode,
} from "@/components/developer/developer-shared";

const EXPIRATION_VALUES = ["7d", "30d", "90d", "1y", "never"] as const;
type ExpirationValue = (typeof EXPIRATION_VALUES)[number];

const EXPIRATION_DAYS: Record<ExpirationValue, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
  "never": null,
};


interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateApiKeyDialog({ open, onOpenChange, onCreated }: CreateApiKeyDialogProps) {
  const t = useTranslations("settings.developer");
  const tc = useTranslations("common");

  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Set<ScopeKey>>(new Set(DEFAULT_SCOPES));
  const [expandedNodes, setExpandedNodes] = useState<Set<ScopeKey>>(new Set(ALL_PARENT_KEYS));
  const [expiration, setExpiration] = useState<ExpirationValue>("never");
  const [understandText, setUnderstandText] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const confirmPhrase = t("createDialog.confirmPhrase");

  const createMutation = trpc.developer.createApiKey.useMutation({
    onSuccess: (data) => {
      setCreatedKey(data.key);
      onCreated();
    },
    onError: (err) => toast.error(err.message ?? t("createDialog.createError")),
  });

  const implied = computeImplied(selectedScopes);

  const hasDestructive = Array.from(selectedScopes).some((k) => API_SCOPES[k].destructive);
  const hasSensitive = Array.from(selectedScopes).some((k) => API_SCOPES[k].sensitive);
  const understandConfirmed = !hasDestructive || understandText === confirmPhrase;
  const canCreate = name.trim() && understandConfirmed && !createMutation.isPending;

  function toggleScope(scope: ScopeKey) {
    if (API_SCOPES[scope].default) return;
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      next.has(scope) ? next.delete(scope) : next.add(scope);
      return next;
    });
  }

  function toggleExpanded(key: ScopeKey) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
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

  function handleClose() {
    setName("");
    setSelectedScopes(new Set(DEFAULT_SCOPES));
    setExpandedNodes(new Set(ALL_PARENT_KEYS));
    setExpiration("never");
    setUnderstandText("");
    setCreatedKey(null);
    onOpenChange(false);
  }

  const badges = {
    default: t("createDialog.scopeDefaultBadge"),
    included: t("createDialog.scopeIncludedBadge"),
    sensitive: t("createDialog.scopeSensitiveBadge"),
    destructive: t("createDialog.scopeDestructiveBadge"),
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleClose}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        {createdKey ? (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{t("createDialog.createdTitle")}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>{t("createDialog.createdDescription")}</ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="space-y-4">
              <CopyableInput value={createdKey} ariaLabel={t("createDialog.copyAriaLabel")} />
              <SaveWarning message={t("createDialog.saveWarning")} />
              <div className="flex justify-end">
                <Button onClick={handleClose}>{t("createDialog.done")}</Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{t("createDialog.title")}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>{t("createDialog.description")}</ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
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
                <p className="text-xs text-muted-foreground">{t("createDialog.nameDescription")}</p>
              </div>

              <div className="space-y-2">
                <Label>{t("createDialog.scopesLabel")}</Label>
                <div className="border rounded-md">
                  <div className="max-h-128 overflow-y-auto p-1">
                    {SCOPE_TREE.map((node) => (
                      <ScopeTreeNode
                        key={node.key}
                        node={node}
                        selected={selectedScopes}
                        expanded={expandedNodes}
                        implied={implied}
                        onToggle={toggleScope}
                        onToggleExpanded={toggleExpanded}
                        idPrefix="scope"
                        scopeName={(k) => t(`scopes.${k}.name`)}
                        scopeDescription={(k) => t(`scopes.${k}.description`)}
                        badges={badges}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiration">{t("createDialog.expirationLabel")}</Label>
                <Select value={expiration} onValueChange={(v) => setExpiration(v as ExpirationValue)}>
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
                  <Label htmlFor="understand" className="text-xs text-red-600 dark:text-red-400">
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
                <Button variant="outline" onClick={handleClose}>{tc("cancel")}</Button>
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
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
