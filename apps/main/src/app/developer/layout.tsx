import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileCode2, TriangleAlert } from "lucide-react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@tomomai/ui/shadcn-sidebar";
import { Separator } from "@tomomai/ui";
import { getRegistry, routeSlug } from "@/lib/api/specs";
import { listGuides } from "@/lib/developer/guides";
import { DeveloperSidebar } from "@/components/developer/sidebar";
import { useDeveloperPortal } from "@/lib/flags";

export const metadata: Metadata = {
  title: { default: "Developer Center", template: "%s — tomomai Developer Center" },
  description:
    "Build with the tomomai API. Personal API keys, OAuth 2.1, scopes, and " +
    "reference for every /api/v1/* endpoint.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const dynamic = "force-dynamic";

export default async function DeveloperLayout({ children }: { children: React.ReactNode }) {
  if (!(await useDeveloperPortal())) {
    notFound();
  }

  const routes = getRegistry();
  const guides = await listGuides();

  const grouped = new Map<string, typeof routes>();
  for (const r of routes) {
    const list = grouped.get(r.tag) ?? [];
    list.push(r);
    grouped.set(r.tag, list);
  }
  const routeGroups = Array.from(grouped.entries()).map(([tag, list]) => ({
    tag,
    routes: list.map((r) => ({ slug: routeSlug(r), method: r.method, path: r.path })),
  }));

  return (
    <>
      <PreviewBanner />
      <SidebarProvider>
        <DeveloperSidebar guides={guides} routeGroups={routeGroups} />
        <SidebarInset>
          {/*<header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">*/}
          <header className="flex h-14 shrink-0 px-4 items-center gap-3 border-b border-border justify-between">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
            </div>
            <Link
              href="/developer/openapi.json"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-xs font-medium text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50"
            >
              <FileCode2 className="size-3.5" />
              OpenAPI
            </Link>
          </header>
          <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-5xl">{children}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}

function PreviewBanner() {
  return (
    <div className="sticky top-0 z-50 w-full border-b border-border bg-muted/60 backdrop-blur-sm p-4">
      <div className="max-w-screen-xl mx-auto flex gap-3 items-start">
        <div className="mt-0.5 shrink-0 rounded-full bg-primary/15 p-1">
          <TriangleAlert className="h-3 w-3 text-primary" />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Developer API is not yet open to the public
          </p>
          <div className="text-sm text-muted-foreground">
            <span className="block">
              Personal API keys and OAuth 2.1 apps are still gated while we
              finish auth hardening and observe the new limiter under real
              traffic. This documentation is published for preview only.
              Creating keys or registering OAuth clients will not work in
              production yet.
            </span>
            <span className="block mt-[0.5em]">
              The portal will open in a follow-up release once the v1 auth
              rework has been stable for long enough. Check back then.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
