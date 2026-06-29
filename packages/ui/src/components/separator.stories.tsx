import type { Meta, StoryObj } from "@storybook/react";
import { Separator } from "./separator";

const meta = {
  title: "UI/Separator",
  component: Separator,
  tags: ["autodocs"],
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-72">
      <p className="text-sm font-medium">maimai charts</p>
      <p className="text-muted-foreground text-sm">Track your scores</p>
      <Separator className="my-4" />
      <div className="flex h-5 items-center gap-3 text-sm">
        <span>Songs</span>
        <Separator orientation="vertical" />
        <span>Albums</span>
        <Separator orientation="vertical" />
        <span>Stats</span>
      </div>
    </div>
  ),
};
