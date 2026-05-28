"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "@tomomai/ui/shadcn-sidebar";
import {
  ArrowLeft,
  BookOpen,
  Code2,
  FileJson,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import type { RouteSpec } from "@/lib/api/registry";
import type { GuideMeta } from "@/lib/developer/guides";

interface DeveloperSidebarProps {
  guides: GuideMeta[];
  /** Routes grouped by tag, in render order. */
  routeGroups: { tag: string; routes: { slug: string; method: string; path: string }[] }[];
}

export function DeveloperSidebar({ guides, routeGroups }: DeveloperSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Back to tomomai">
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Code2 className="size-4" />
                </div>
                <div className="flex flex-1 flex-col text-left text-sm leading-tight">
                  <span className="font-semibold">tomomai</span>
                  <span className="text-xs text-muted-foreground">Developer Center</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="gap-2">
            <BookOpen className="size-3.5" />
            Guides
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {guides.map((g) => {
                const href = `/developer/guides/${g.slug}`;
                return (
                  <SidebarMenuItem key={g.slug}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === href}
                      tooltip={g.title}
                    >
                      <Link href={href}>
                        <span>{g.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="gap-2">
            <ShieldCheck className="size-3.5" />
            Concepts
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/developer/scopes"}
                  tooltip="Scopes"
                >
                  <Link href="/developer/scopes">
                    <span>Scopes</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="gap-2">
            <FileJson className="size-3.5" />
            Reference
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/developer/reference"}
                  tooltip="All endpoints"
                >
                  <Link href="/developer/reference">
                    <span>All endpoints</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {routeGroups.map((group) => (
                <SidebarMenuItem key={group.tag}>
                  <SidebarMenuButton tooltip={group.tag}>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      {group.tag}
                    </span>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    {group.routes.map((r) => {
                      const href = `/developer/reference/${r.slug}`;
                      return (
                        <SidebarMenuSubItem key={r.slug}>
                          <SidebarMenuSubButton asChild isActive={pathname === href}>
                            <Link href={href}>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {r.method}
                              </span>
                              <span className="truncate">
                                {r.path.replace(/^\/api\/v1/, "")}
                              </span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Your API keys" size="sm">
              <Link href="/settings/developer">
                <KeyRound className="size-4" />
                <span>Your API keys</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Back to tomomai" size="sm">
              <Link href="/">
                <ArrowLeft className="size-4" />
                <span>Back to tomomai</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
