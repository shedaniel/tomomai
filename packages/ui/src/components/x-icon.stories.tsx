import type { Meta, StoryObj } from "@storybook/react";
import { XIcon } from "./x-icon";

const meta = {
  title: "UI/Icons/XIcon",
  component: XIcon,
  tags: ["autodocs"],
} satisfies Meta<typeof XIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4 text-foreground">
      <XIcon className="size-4" />
      <XIcon className="size-6" />
      <XIcon className="size-10" />
    </div>
  ),
};
