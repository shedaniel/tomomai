import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { RegionSwitcher } from "./region-switcher";
import type { Region } from "@/lib/types";

// Example: an i18n-coupled app component. It works in Storybook purely through
// the global NextIntlClientProvider decorator (en messages) — no MSW needed.
const meta = {
  title: "Main/RegionSwitcher",
  component: RegionSwitcher,
  tags: ["autodocs"],
} satisfies Meta<typeof RegionSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [region, setRegion] = React.useState<Region>("intl");
    return <RegionSwitcher value={region} onChange={setRegion} />;
  },
};

export const HeaderVariant: Story = {
  render: () => {
    const [region, setRegion] = React.useState<Region>("jp");
    return <RegionSwitcher header value={region} onChange={setRegion} />;
  },
};
