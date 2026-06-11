import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select-friendly";

const meta = {
  title: "UI/SelectFriendly",
  component: Select,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Animated select on desktop, full drawer on screens <= 768px. Resize the preview to see it switch.",
      },
    },
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = React.useState<string>();
    return (
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Select a region" />
        </SelectTrigger>
        <SelectContent label="Region">
          <SelectItem value="jp">Japan</SelectItem>
          <SelectItem value="intl">International</SelectItem>
          <SelectItem value="cn">China</SelectItem>
        </SelectContent>
      </Select>
    );
  },
};
