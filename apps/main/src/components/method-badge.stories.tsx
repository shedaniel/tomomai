import type { Meta, StoryObj } from "@storybook/react";
import { MethodBadge } from "./developer/method-badge";

// Example: a fully presentational app component (no i18n, no tRPC).
const meta = {
  title: "Main/MethodBadge",
  component: MethodBadge,
  tags: ["autodocs"],
  argTypes: {
    method: {
      control: "select",
      options: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    },
    size: { control: "inline-radio", options: ["sm", "md"] },
  },
  args: { method: "GET", size: "sm" },
} satisfies Meta<typeof MethodBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllMethods: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
        <MethodBadge key={m} method={m} size="md" />
      ))}
    </div>
  ),
};
