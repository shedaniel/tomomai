import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { BarChart3, Disc3, ListMusic, Settings } from "lucide-react";
import { Sidebar, SidebarItem } from "./sidebar";

const meta = {
  title: "UI/Sidebar",
  component: Sidebar,
  tags: ["autodocs"],
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = React.useState("songs");
    return (
      <Sidebar value={value} onValueChange={setValue}>
        <SidebarItem value="songs" icon={ListMusic} text="Songs" />
        <SidebarItem value="albums" icon={Disc3} text="Albums" />
        <SidebarItem value="stats" icon={BarChart3} text="Stats" />
        <SidebarItem value="settings" icon={Settings} text="Settings" />
      </Sidebar>
    );
  },
};
