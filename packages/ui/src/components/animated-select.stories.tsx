import type { Meta, StoryObj } from "@storybook/react";
import { AnimatedSelect, AnimatedSelectContent } from "./animated-select";
import { SelectItem, SelectTrigger, SelectValue } from "./select";

const meta = {
  title: "UI/AnimatedSelect",
  component: AnimatedSelect,
  tags: ["autodocs"],
} satisfies Meta<typeof AnimatedSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

// AnimatedSelect provides spring open/close animation; pair it with the styled
// SelectTrigger / SelectItem from ./select (as select-friendly does internally).
export const Default: Story = {
  render: () => (
    <AnimatedSelect>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Select a difficulty" />
      </SelectTrigger>
      <AnimatedSelectContent>
        <SelectItem value="basic">Basic</SelectItem>
        <SelectItem value="advanced">Advanced</SelectItem>
        <SelectItem value="expert">Expert</SelectItem>
        <SelectItem value="master">Master</SelectItem>
        <SelectItem value="remaster">Re:Master</SelectItem>
      </AnimatedSelectContent>
    </AnimatedSelect>
  ),
};
