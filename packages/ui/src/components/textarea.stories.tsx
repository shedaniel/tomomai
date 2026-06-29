import type { Meta, StoryObj } from "@storybook/react";
import { Textarea } from "./textarea";
import { Label } from "./label";

const meta = {
  title: "UI/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  args: { placeholder: "Type your message here." },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: (args) => <Textarea className="w-80" {...args} /> };

export const WithLabel: Story = {
  render: (args) => (
    <div className="grid w-80 gap-2">
      <Label htmlFor="message">Message</Label>
      <Textarea id="message" {...args} />
    </div>
  ),
};

export const Disabled: Story = { render: (args) => <Textarea className="w-80" disabled {...args} /> };
