import type { Meta, StoryObj } from "@storybook/react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "./chart";

const meta = {
  title: "UI/Chart",
  component: ChartContainer,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ChartContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

const data = [
  { month: "Jan", basic: 186, advanced: 80 },
  { month: "Feb", basic: 305, advanced: 200 },
  { month: "Mar", basic: 237, advanced: 120 },
  { month: "Apr", basic: 73, advanced: 190 },
  { month: "May", basic: 209, advanced: 130 },
  { month: "Jun", basic: 214, advanced: 140 },
];

const config = {
  basic: { label: "Basic", color: "var(--chart-1)" },
  advanced: { label: "Advanced", color: "var(--chart-2)" },
} satisfies ChartConfig;

export const Bars: Story = {
  render: () => (
    <ChartContainer config={config} className="h-72 w-[36rem] p-4">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="basic" fill="var(--color-basic)" radius={4} />
        <Bar dataKey="advanced" fill="var(--color-advanced)" radius={4} />
      </BarChart>
    </ChartContainer>
  ),
};
