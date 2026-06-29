import type { Meta, StoryObj } from "@storybook/react";
import { Slider } from "./slider";

const meta = {
  title: "UI/Slider",
  component: Slider,
  tags: ["autodocs"],
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

// Slider renders two thumbs, so it works as a range selector.
export const Default: Story = {
  render: () => (
    <Slider className="w-80" defaultValue={[25, 75]} min={0} max={100} step={1} />
  ),
};

export const SingleRange: Story = {
  render: () => (
    <Slider className="w-80" defaultValue={[40, 40]} min={0} max={100} step={1} />
  ),
};
