import type { Meta, StoryObj } from "@storybook/react";
import { BarChart3, Disc3, ListMusic, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "./shadcn-sidebar";

const meta = {
  title: "UI/ShadcnSidebar",
  component: Sidebar,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = [
  { title: "Songs", icon: ListMusic },
  { title: "Albums", icon: Disc3 },
  { title: "Stats", icon: BarChart3 },
  { title: "Settings", icon: Settings },
];

export const Default: Story = {
  render: () => (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-4 py-3 text-sm font-semibold">
          maimai charts
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Browse</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton>
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <span className="text-sm font-medium">Songs</span>
        </header>
        <div className="p-4 text-sm text-muted-foreground">
          Toggle the sidebar with the trigger or press ⌘/Ctrl+B.
        </div>
      </SidebarInset>
    </SidebarProvider>
  ),
};
