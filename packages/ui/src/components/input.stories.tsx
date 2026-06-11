import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "UI/Input",
  component: Input,
  tags: ["autodocs"],
  args: { placeholder: "Enter your name" },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  render: (args) => (
    <div className="grid w-72 gap-2">
      <Label htmlFor="name">Name</Label>
      <Input id="name" {...args} />
    </div>
  ),
};

export const Types: Story = {
  render: () => (
    <div className="grid w-72 gap-3">
      <Input type="text" placeholder="Text" />
      <Input type="email" placeholder="Email" />
      <Input type="password" placeholder="Password" />
      <Input type="number" placeholder="Number" />
    </div>
  ),
};

export const Disabled: Story = { args: { disabled: true } };

export const Invalid: Story = { args: { "aria-invalid": true, defaultValue: "bad value" } };
