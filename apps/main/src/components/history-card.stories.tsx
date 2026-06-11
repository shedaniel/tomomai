import type { Meta, StoryObj } from "@storybook/react";
import { HistoryCard } from "./history-card";
import { mockTrpc } from "../../.storybook/trpc-msw";

// Example: a tRPC-backed app component. The `getRatingHistory` query is served
// by MSW via the `mockTrpc` helper. See .storybook/README.md for the pattern.
const meta = {
  title: "Main/HistoryCard",
  component: HistoryCard,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof HistoryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// Plain JSON-safe fixture: dates are ISO strings (the component calls
// `new Date(entry.date)`), and `changes` is left empty so no cover images load.
function makeHistory() {
  const start = Date.UTC(2024, 0, 1);
  const day = 86_400_000;
  const ratings = [14820, 14910, 14980, 15010, 15042, 15090, 15120, 15155];
  return {
    history: ratings.map((rating, i) => ({
      date: new Date(start + i * 14 * day).toISOString(),
      rating,
      changes: [],
    })),
  };
}

export const WithData: Story = {
  args: { region: "intl" },
  parameters: {
    msw: { handlers: [mockTrpc({ "user.getRatingHistory": makeHistory() })] },
  },
};

export const Empty: Story = {
  args: { region: "intl" },
  parameters: {
    msw: { handlers: [mockTrpc({ "user.getRatingHistory": { history: [] } })] },
  },
};
