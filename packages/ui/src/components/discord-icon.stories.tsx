import type { Meta, StoryObj } from "@storybook/react";
import { DiscordIcon } from "./discord-icon";

const meta = {
  title: "UI/Icons/DiscordIcon",
  component: DiscordIcon,
  tags: ["autodocs"],
} satisfies Meta<typeof DiscordIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4 text-primary">
      <DiscordIcon className="size-4" />
      <DiscordIcon className="size-6" />
      <DiscordIcon className="size-10" />
    </div>
  ),
};
