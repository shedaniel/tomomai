import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "./dialog-friendly";

const meta = {
  title: "UI/DialogFriendly",
  component: ResponsiveDialog,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Renders an animated dialog on desktop and a bottom drawer on screens <= 768px. Resize the preview to see it switch.",
      },
    },
  },
} satisfies Meta<typeof ResponsiveDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ResponsiveDialog>
      <ResponsiveDialogTrigger asChild>
        <Button variant="outline">Open</Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Responsive dialog</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Dialog on desktop, drawer on mobile.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogFooter>
          <ResponsiveDialogClose asChild>
            <Button>Done</Button>
          </ResponsiveDialogClose>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  ),
};
