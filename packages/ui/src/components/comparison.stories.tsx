import type { Meta, StoryObj } from "@storybook/react";
import { Comparison, ComparisonHandle, ComparisonItem } from "./comparison";

const meta = {
  title: "UI/Comparison",
  component: Comparison,
  tags: ["autodocs"],
  argTypes: { mode: { control: "inline-radio", options: ["drag", "hover"] } },
} satisfies Meta<typeof Comparison>;

export default meta;
type Story = StoryObj<typeof meta>;

const img =
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&q=80";

export const Default: Story = {
  args: { mode: "drag" },
  render: (args) => (
    <Comparison
      {...args}
      className="aspect-video w-[32rem] max-w-full overflow-hidden rounded-xl border"
    >
      <ComparisonItem position="left">
        <img src={img} alt="Before" className="size-full object-cover grayscale" />
      </ComparisonItem>
      <ComparisonItem position="right">
        <img src={img} alt="After" className="size-full object-cover" />
      </ComparisonItem>
      <ComparisonHandle />
    </Comparison>
  ),
};

export const HoverMode: Story = {
  ...Default,
  args: { mode: "hover" },
};
