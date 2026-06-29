import type { Meta, StoryObj } from "@storybook/react";
import { Progress } from "./progress";

const meta = {
  title: "UI/Progress",
  component: Progress,
  tags: ["autodocs"],
  argTypes: { value: { control: { type: "range", min: 0, max: 100 } } },
  args: { value: 60 },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: (args) => <Progress className="w-80" {...args} /> };

export const Steps: Story = {
  render: () => (
    <div className="grid w-80 gap-3">
      <Progress value={0} />
      <Progress value={33} />
      <Progress value={66} />
      <Progress value={100} />
    </div>
  ),
};
