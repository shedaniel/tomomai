"use client";

import {
  ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription,
  ResponsiveDialogHeader, ResponsiveDialogTitle, Input, Label, Button,
} from "@tomomai/ui";
import { useEffect, useState } from "react";
import { UsersBrowserDialog } from "./users-browser-dialog";
import { ProfileReportsDialog } from "./profile-reports-dialog";
import { useTranslations } from "next-intl";

interface AdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminDialog({ open, onOpenChange }: AdminDialogProps) {
  const [adminToken, setAdminToken] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState("");
  const [usersBrowserOpen, setUsersBrowserOpen] = useState(false);
  const [profileReportsOpen, setProfileReportsOpen] = useState(false);
  const profileReportsT = useTranslations("Admin.profileReports");

  useEffect(() => {
    const saved = localStorage.getItem("adminToken");
    if (saved) setAdminToken(saved);
  }, []);
  useEffect(() => {
    if (adminToken) localStorage.setItem("adminToken", adminToken);
  }, [adminToken]);

  async function syncCatalog() {
    setSyncing(true);
    setResult("");
    try {
      const response = await fetch("/api/admin/catalog-sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `Catalog sync failed (${response.status})`);
      setResult(JSON.stringify(body, null, 2));
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Catalog sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Administration</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>Manage users and synchronize the chart catalog.</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="adminToken">Admin Token</Label>
              <Input id="adminToken" type="password" value={adminToken} onChange={event => setAdminToken(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>User Management</Label>
              <Button variant="outline" onClick={() => setUsersBrowserOpen(true)}>Browse All Users</Button>
            </div>
            <div className="grid gap-2">
              <Label>{profileReportsT("sectionLabel")}</Label>
              <Button variant="outline" onClick={() => setProfileReportsOpen(true)}>{profileReportsT("open")}</Button>
            </div>
            <div className="grid gap-2">
              <Label>Chart Catalog</Label>
              <p className="text-sm text-muted-foreground">Load the latest published charts and events from the catalog service.</p>
              <Button variant="outline" onClick={syncCatalog} disabled={syncing || !adminToken}>
                {syncing ? "Synchronizing…" : "Sync Catalog"}
              </Button>
            </div>
            {result && <pre role="status" className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-sm">{result}</pre>}
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
      <UsersBrowserDialog open={usersBrowserOpen} onOpenChange={setUsersBrowserOpen} adminToken={adminToken} />
      <ProfileReportsDialog open={profileReportsOpen} onOpenChange={setProfileReportsOpen} adminToken={adminToken} />
    </>
  );
}
