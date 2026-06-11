import type { Meta, StoryObj } from "@storybook/react";
import { toast } from "sonner";
import { Button } from "./button";
import { Toaster } from "./sonner";

const meta = {
  title: "UI/Sonner",
  component: Toaster,
  tags: ["autodocs"],
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={() => toast("Snapshot saved")}>
        Default
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.success("Profile synced successfully")}
      >
        Success
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.error("Failed to reach the server")}
      >
        Error
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast("New high score", {
            description: "Oshama Scramble! — 100.8534%",
            action: { label: "View", onClick: () => {} },
          })
        }
      >
        With action
      </Button>
      <Toaster />
    </div>
  ),
};
