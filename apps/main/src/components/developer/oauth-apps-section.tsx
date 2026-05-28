"use client";

import { useState } from "react";
import { Button } from "@tomomai/ui";
import { Input } from "@tomomai/ui";
import { Label } from "@tomomai/ui";
import { Badge } from "@tomomai/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@tomomai/ui";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@tomomai/ui";
import { trpc } from "@/lib/trpc-client";
import { API_SCOPES, type ScopeKey } from "@/lib/api/scopes";
import { useReauthGuard } from "@/lib/security/use-reauth-guard";
import { SettingsField } from "@/components/settings/primitives";
import { toast } from "sonner";
import { Plus, Trash2, Globe, Loader2, RefreshCw, AlertTriangle, X, AppWindow, Pencil } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
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

// ── Types ─────────────────────────────────────────────────────────────────────

type OAuthApp = {
  id: string;
  clientId: string;
  name: string | null;
  uri: string | null;
  icon: string | null;
  policy: string | null;
  tos: string | null;
  redirectUris: string[] | null;
  scopes: string[] | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

// ── Shared form hook ──────────────────────────────────────────────────────────

type OAuthAppFormInit = {
  name?: string;
  uri?: string;
  icon?: string;
  policy?: string;
  tos?: string;
  redirectUris?: string[];
  scopes?: string[];
};

function useOAuthAppForm(initial: OAuthAppFormInit) {
  const [name, setName] = useState(initial.name ?? "");
  const [uriInput, setUriInput] = useState(initial.uri ?? "");
  const [iconInput, setIconInput] = useState(initial.icon ?? "");
  const [policyInput, setPolicyInput] = useState(initial.policy ?? "");
  const [tosInput, setTosInput] = useState(initial.tos ?? "");
  const [redirectUris, setRedirectUris] = useState<string[]>(initial.redirectUris ?? []);
  const [redirectInput, setRedirectInput] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Set<ScopeKey>>(
    initial.scopes
      ? new Set((initial.scopes).filter((s): s is ScopeKey => s in API_SCOPES))
      : new Set(DEFAULT_SCOPES)
  );
  const [expandedNodes, setExpandedNodes] = useState<Set<ScopeKey>>(new Set(ALL_PARENT_KEYS));

  function toggleScope(key: ScopeKey) {
    if (API_SCOPES[key].default) return;
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
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

  function addRedirectUri() {
    const val = redirectInput.trim();
    if (!val) return;
    try { new URL(val); } catch {
      toast.error("Invalid redirect URI — must be a full URL.");
      return;
    }
    if (redirectUris.includes(val)) return;
    setRedirectUris((p) => [...p, val]);
    setRedirectInput("");
  }

  function removeRedirectUri(uri: string) {
    setRedirectUris((p) => p.filter((u) => u !== uri));
  }

  function reset() {
    setName(initial.name ?? "");
    setUriInput(initial.uri ?? "");
    setIconInput(initial.icon ?? "");
    setPolicyInput(initial.policy ?? "");
    setTosInput(initial.tos ?? "");
    setRedirectUris(initial.redirectUris ?? []);
    setRedirectInput("");
    setSelectedScopes(
      initial.scopes
        ? new Set((initial.scopes).filter((s): s is ScopeKey => s in API_SCOPES))
        : new Set(DEFAULT_SCOPES)
    );
    setExpandedNodes(new Set(ALL_PARENT_KEYS));
  }

  const implied = computeImplied(selectedScopes);

  return {
    name, setName,
    uriInput, setUriInput,
    iconInput, setIconInput,
    policyInput, setPolicyInput,
    tosInput, setTosInput,
    redirectUris,
    redirectInput, setRedirectInput,
    selectedScopes,
    implied,
    expandedNodes,
    toggleScope,
    toggleExpanded,
    addRedirectUri,
    removeRedirectUri,
    reset,
  };
}

// ── Shared field components ───────────────────────────────────────────────────

function RedirectUrisField({
  redirectUris,
  redirectInput,
  setRedirectInput,
  addRedirectUri,
  removeRedirectUri,
  placeholder,
  addLabel,
}: {
  redirectUris: string[];
  redirectInput: string;
  setRedirectInput: (v: string) => void;
  addRedirectUri: () => void;
  removeRedirectUri: (uri: string) => void;
  placeholder: string;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={redirectInput}
          onChange={(e) => setRedirectInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRedirectUri(); } }}
        />
        <Button type="button" variant="outline" size="sm" onClick={addRedirectUri}>
          {addLabel}
        </Button>
      </div>
      {redirectUris.length > 0 && (
        <ul className="space-y-1 mt-1">
          {redirectUris.map((uri) => (
            <li key={uri} className="flex items-center gap-2 text-sm bg-muted rounded px-2 py-1">
              <span className="flex-1 truncate font-mono text-xs">{uri}</span>
              <button
                type="button"
                onClick={() => removeRedirectUri(uri)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScopePickerField({
  selectedScopes,
  implied,
  expandedNodes,
  toggleScope,
  toggleExpanded,
  idPrefix,
  badges,
  scopeName,
  scopeDescription,
}: {
  selectedScopes: Set<ScopeKey>;
  implied: Set<ScopeKey>;
  expandedNodes: Set<ScopeKey>;
  toggleScope: (key: ScopeKey) => void;
  toggleExpanded: (key: ScopeKey) => void;
  idPrefix: string;
  badges: { default: string; included: string; sensitive: string };
  scopeName: (k: ScopeKey) => string;
  scopeDescription: (k: ScopeKey) => string;
}) {
  return (
    <div className="border rounded-md">
      <div className="max-h-64 overflow-y-auto p-1">
        {SCOPE_TREE.map((node) => (
          <ScopeTreeNode
            key={node.key}
            node={node}
            selected={selectedScopes}
            expanded={expandedNodes}
            implied={implied}
            onToggle={toggleScope}
            onToggleExpanded={toggleExpanded}
            idPrefix={idPrefix}
            scopeName={scopeName}
            scopeDescription={scopeDescription}
            badges={badges}
          />
        ))}
      </div>
    </div>
  );
}

// ── Create dialog ─────────────────────────────────────────────────────────────

const CREATE_INITIAL: OAuthAppFormInit = {};

function CreateOAuthAppDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations("settings.developer");
  const tc = useTranslations("common");
  const form = useOAuthAppForm(CREATE_INITIAL);
  const [createdApp, setCreatedApp] = useState<{ clientId: string; secret: string } | null>(null);

  const createMutation = trpc.developer.createOAuthApp.useMutation({
    ...useReauthGuard({
      callbackURL: "/settings/developer",
      reauthMessage: t("reauthRequired"),
      fallback: t("oauthApps.createDialog.createError"),
    }),
    onSuccess: (data) => {
      setCreatedApp({ clientId: String(data.client_id), secret: String(data.client_secret) });
      onCreated();
    },
  });

  function handleCreate() {
    if (!form.name.trim()) { toast.error("App name is required."); return; }
    if (form.redirectUris.length === 0) { toast.error("At least one redirect URI is required."); return; }
    if (form.selectedScopes.size === 0) { toast.error("Select at least one scope."); return; }
    createMutation.mutate({
      name: form.name.trim(),
      redirectUris: form.redirectUris,
      scopes: Array.from(form.selectedScopes) as [ScopeKey, ...ScopeKey[]],
      uri: form.uriInput || undefined,
    });
  }

  function handleClose() {
    form.reset();
    setCreatedApp(null);
    onOpenChange(false);
  }

  const badges = {
    default: t("createDialog.scopeDefaultBadge"),
    included: t("createDialog.scopeIncludedBadge"),
    sensitive: t("createDialog.scopeSensitiveBadge"),
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleClose}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        {createdApp ? (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{t("oauthApps.createDialog.createdTitle")}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>{t("oauthApps.createDialog.createdDescription")}</ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t("oauthApps.createDialog.clientIdLabel")}</Label>
                <CopyableInput value={createdApp.clientId} ariaLabel={t("oauthApps.createDialog.copyAriaLabel")} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t("oauthApps.createDialog.secretLabel")}</Label>
                <CopyableInput value={createdApp.secret} ariaLabel={t("oauthApps.createDialog.copyAriaLabel")} />
              </div>
              <SaveWarning message={t("oauthApps.createDialog.saveWarning")} />
              <div className="flex justify-end">
                <Button onClick={handleClose}>{t("oauthApps.createDialog.done")}</Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{t("oauthApps.createDialog.title")}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>{t("oauthApps.createDialog.description")}</ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="oauth-name">{t("oauthApps.createDialog.nameLabel")}</Label>
                <Input
                  id="oauth-name"
                  placeholder={t("oauthApps.createDialog.namePlaceholder")}
                  value={form.name}
                  onChange={(e) => form.setName(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">{t("oauthApps.createDialog.nameDescription")}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="oauth-uri">{t("oauthApps.createDialog.uriLabel")}</Label>
                <Input
                  id="oauth-uri"
                  placeholder={t("oauthApps.createDialog.uriPlaceholder")}
                  value={form.uriInput}
                  onChange={(e) => form.setUriInput(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("oauthApps.createDialog.redirectLabel")}</Label>
                <RedirectUrisField
                  redirectUris={form.redirectUris}
                  redirectInput={form.redirectInput}
                  setRedirectInput={form.setRedirectInput}
                  addRedirectUri={form.addRedirectUri}
                  removeRedirectUri={form.removeRedirectUri}
                  placeholder={t("oauthApps.createDialog.redirectPlaceholder")}
                  addLabel={t("oauthApps.createDialog.redirectAddButton")}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("oauthApps.createDialog.scopesLabel")}</Label>
                <ScopePickerField
                  selectedScopes={form.selectedScopes}
                  implied={form.implied}
                  expandedNodes={form.expandedNodes}
                  toggleScope={form.toggleScope}
                  toggleExpanded={form.toggleExpanded}
                  idPrefix="scope-oauth"
                  badges={badges}
                  scopeName={(k) => t(`scopes.${k}.name`)}
                  scopeDescription={(k) => t(`scopes.${k}.description`)}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose} disabled={createMutation.isPending}>
                  {tc("cancel")}
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t("oauthApps.createDialog.creating")}
                    </>
                  ) : (
                    t("oauthApps.createDialog.createButton")
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

// ── Edit dialog ───────────────────────────────────────────────────────────────

function EditOAuthAppDialog({
  app,
  onOpenChange,
  onSaved,
}: {
  app: OAuthApp;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("settings.developer");
  const tc = useTranslations("common");
  const form = useOAuthAppForm({
    name: app.name ?? "",
    uri: app.uri ?? "",
    icon: app.icon ?? "",
    policy: app.policy ?? "",
    tos: app.tos ?? "",
    redirectUris: app.redirectUris ?? [],
    scopes: app.scopes ?? [],
  });

  const updateMutation = trpc.developer.updateOAuthApp.useMutation({
    ...useReauthGuard({
      callbackURL: "/settings/developer",
      reauthMessage: t("reauthRequired"),
      fallback: t("oauthApps.editDialog.saveError"),
    }),
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
  });

  function handleSave() {
    if (!form.name.trim()) { toast.error("App name is required."); return; }
    if (form.redirectUris.length === 0) { toast.error("At least one redirect URI is required."); return; }
    if (form.selectedScopes.size === 0) { toast.error("Select at least one scope."); return; }
    updateMutation.mutate({
      clientId: app.clientId,
      name: form.name.trim(),
      redirectUris: form.redirectUris,
      uri: form.uriInput || null,
      icon: form.iconInput || null,
      policy: form.policyInput || null,
      tos: form.tosInput || null,
      scopes: Array.from(form.selectedScopes) as [ScopeKey, ...ScopeKey[]],
    });
  }

  const badges = {
    default: t("createDialog.scopeDefaultBadge"),
    included: t("createDialog.scopeIncludedBadge"),
    sensitive: t("createDialog.scopeSensitiveBadge"),
  };

  return (
    <ResponsiveDialog open onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("oauthApps.editDialog.title")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t("oauthApps.editDialog.description")}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="space-y-5">
          {/* Basic Info */}
          <div className="space-y-4">
            <p className="text-sm font-medium">{t("oauthApps.editDialog.basicSection")}</p>
            <div className="space-y-2">
              <Label htmlFor="edit-oauth-name">{t("oauthApps.editDialog.nameLabel")}</Label>
              <Input
                id="edit-oauth-name"
                value={form.name}
                onChange={(e) => form.setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-oauth-uri">{t("oauthApps.editDialog.uriLabel")}</Label>
              <Input
                id="edit-oauth-uri"
                placeholder="https://example.com"
                value={form.uriInput}
                onChange={(e) => form.setUriInput(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-oauth-icon">{t("oauthApps.editDialog.iconLabel")}</Label>
              <Input
                id="edit-oauth-icon"
                placeholder={t("oauthApps.editDialog.iconPlaceholder")}
                value={form.iconInput}
                onChange={(e) => form.setIconInput(e.target.value)}
              />
            </div>
          </div>

          {/* Redirect URIs */}
          <div className="border-t pt-4 space-y-4">
            <p className="text-sm font-medium">{t("oauthApps.editDialog.redirectSection")}</p>
            <RedirectUrisField
              redirectUris={form.redirectUris}
              redirectInput={form.redirectInput}
              setRedirectInput={form.setRedirectInput}
              addRedirectUri={form.addRedirectUri}
              removeRedirectUri={form.removeRedirectUri}
              placeholder={t("oauthApps.createDialog.redirectPlaceholder")}
              addLabel={t("oauthApps.createDialog.redirectAddButton")}
            />
          </div>

          {/* Scopes */}
          <div className="border-t pt-4 space-y-4">
            <p className="text-sm font-medium">{t("oauthApps.editDialog.scopesSection")}</p>
            <ScopePickerField
              selectedScopes={form.selectedScopes}
              implied={form.implied}
              expandedNodes={form.expandedNodes}
              toggleScope={form.toggleScope}
              toggleExpanded={form.toggleExpanded}
              idPrefix="edit-scope-oauth"
              badges={badges}
              scopeName={(k) => t(`scopes.${k}.name`)}
              scopeDescription={(k) => t(`scopes.${k}.description`)}
            />
            <p className="text-xs text-muted-foreground">{t("oauthApps.editDialog.scopesNote")}</p>
          </div>

          {/* Legal */}
          <div className="border-t pt-4 space-y-4">
            <p className="text-sm font-medium">{t("oauthApps.editDialog.legalSection")}</p>
            <div className="space-y-2">
              <Label htmlFor="edit-oauth-policy">{t("oauthApps.editDialog.policyLabel")}</Label>
              <Input
                id="edit-oauth-policy"
                placeholder={t("oauthApps.editDialog.policyPlaceholder")}
                value={form.policyInput}
                onChange={(e) => form.setPolicyInput(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-oauth-tos">{t("oauthApps.editDialog.tosLabel")}</Label>
              <Input
                id="edit-oauth-tos"
                placeholder={t("oauthApps.editDialog.tosPlaceholder")}
                value={form.tosInput}
                onChange={(e) => form.setTosInput(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={updateMutation.isPending}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("oauthApps.editDialog.saving")}
                </>
              ) : (
                t("oauthApps.editDialog.saveButton")
              )}
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function OAuthAppsSection() {
  const t = useTranslations("settings.developer");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [rotateId, setRotateId] = useState<string | null>(null);
  const [rotatedSecret, setRotatedSecret] = useState<{ clientId: string; secret: string } | null>(null);
  const [editApp, setEditApp] = useState<OAuthApp | null>(null);

  const { data: apps, isLoading } = trpc.developer.listOAuthApps.useQuery();

  const deleteMutation = trpc.developer.deleteOAuthApp.useMutation({
    ...useReauthGuard({
      callbackURL: "/settings/developer",
      reauthMessage: t("reauthRequired"),
      fallback: t("oauthApps.deleteError"),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [["developer", "listOAuthApps"]] });
      setDeleteId(null);
    },
  });

  const rotateMutation = trpc.developer.rotateOAuthSecret.useMutation({
    ...useReauthGuard({
      callbackURL: "/settings/developer",
      reauthMessage: t("reauthRequired"),
      fallback: t("oauthApps.rotateError"),
    }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [["developer", "listOAuthApps"]] });
      setRotateId(null);
      setRotatedSecret({ clientId: variables.clientId, secret: String(data.client_secret) });
    },
  });

  return (
    <div className="grid gap-4">
      <SettingsField
        layout="inline"
        icon={AppWindow}
        label={t("oauthApps.label")}
        description={t("oauthApps.description")}
        action={
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} className="bg-background">
            <Plus className="h-4 w-4 mr-2" />
            {t("oauthApps.createButton")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 rounded-md border text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tc("loading")}
        </div>
      ) : !apps || apps.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 rounded-md border border-dashed text-center">
          <AppWindow className="h-7 w-7 opacity-60" />
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("oauthApps.emptyTitle")}</p>
            <p className="text-xs text-muted-foreground">
              <button
                onClick={() => setCreateOpen(true)}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {t("oauthApps.emptyCreateLink")}
              </button>{" "}
              {t("oauthApps.emptySuffix")}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {apps.map((app: OAuthApp) => (
            <div key={app.id} className="flex items-start gap-4 px-4 py-3.5">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden mt-0.5">
                {app.icon ? (
                  <img src={app.icon} alt={app.name ?? "App"} className="h-full w-full object-cover" />
                ) : (
                  <Globe className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <span className="text-sm font-semibold leading-none">{app.name ?? app.clientId}</span>
                <p className="font-mono text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm border border-border w-fit truncate max-w-xs">
                  {app.clientId}
                </p>
                {app.uri && (
                  <a href={app.uri} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate block">
                    {app.uri}
                  </a>
                )}
                {(app.redirectUris?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("oauthApps.redirectUris")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {app.redirectUris!.map((uri: string) => (
                        <code key={uri} className="text-xs bg-muted rounded px-2 py-0.5 font-mono">{uri}</code>
                      ))}
                    </div>
                  </div>
                )}
                {(app.scopes?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("oauthApps.scopes")}</p>
                    <div className="flex flex-wrap gap-1">
                      {app.scopes!
                        .filter((s: string) => s in API_SCOPES)
                        .map((s: string) => (
                          <Badge key={s} variant="outline" className="text-xs">
                            {API_SCOPES[s as ScopeKey]?.name ?? s}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setEditApp(app)} aria-label={t("oauthApps.editDialog.title")}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setRotateId(app.clientId)} aria-label={t("oauthApps.rotateAriaLabel")}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteId(app.clientId)} aria-label={t("oauthApps.deleteAriaLabel")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateOAuthAppDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => queryClient.invalidateQueries({ queryKey: [["developer", "listOAuthApps"]] })}
      />

      {editApp && (
        <EditOAuthAppDialog
          app={editApp}
          onOpenChange={(v) => { if (!v) setEditApp(null); }}
          onSaved={() => queryClient.invalidateQueries({ queryKey: [["developer", "listOAuthApps"]] })}
        />
      )}

      {rotatedSecret && (
        <AlertDialog open onOpenChange={(v) => { if (!v) setRotatedSecret(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                {t("oauthApps.createDialog.secretLabel")}
              </AlertDialogTitle>
              <AlertDialogDescription>{t("oauthApps.createDialog.createdDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3">
              <CopyableInput value={rotatedSecret.secret} ariaLabel={t("oauthApps.createDialog.copyAriaLabel")} />
              <SaveWarning message={t("oauthApps.createDialog.saveWarning")} />
            </div>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setRotatedSecret(null)}>
                {t("oauthApps.createDialog.done")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <AlertDialog open={!!rotateId} onOpenChange={(v) => !v && setRotateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("oauthApps.rotateDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("oauthApps.rotateDialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rotateId && rotateMutation.mutate({ clientId: rotateId })}
              disabled={rotateMutation.isPending}
            >
              {rotateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("oauthApps.rotateDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("oauthApps.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("oauthApps.deleteDialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ clientId: deleteId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("oauthApps.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
