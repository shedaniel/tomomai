import type { Meta, StoryObj } from "@storybook/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = {
  title: "UI/Tabs",
  component: Tabs,
  tags: ["autodocs"],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="songs" className="w-96">
      <TabsList>
        <TabsTrigger value="songs">Songs</TabsTrigger>
        <TabsTrigger value="albums">Albums</TabsTrigger>
        <TabsTrigger value="stats">Stats</TabsTrigger>
      </TabsList>
      <TabsContent value="songs" className="text-sm">
        Browse the full song catalog and your scores.
      </TabsContent>
      <TabsContent value="albums" className="text-sm">
        Group plays into albums.
      </TabsContent>
      <TabsContent value="stats" className="text-sm">
        See rating breakdowns and trends.
      </TabsContent>
    </Tabs>
  ),
};
