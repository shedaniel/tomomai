import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";
import {
  AnimatedAlertDialog,
  AnimatedAlertDialogAction,
  AnimatedAlertDialogCancel,
  AnimatedAlertDialogContent,
  AnimatedAlertDialogDescription,
  AnimatedAlertDialogFooter,
  AnimatedAlertDialogHeader,
  AnimatedAlertDialogTitle,
  AnimatedAlertDialogTrigger,
} from "./animated-alert-dialog";

const meta = {
  title: "UI/AnimatedAlertDialog",
  component: AnimatedAlertDialog,
  tags: ["autodocs"],
} satisfies Meta<typeof AnimatedAlertDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <AnimatedAlertDialog>
      <AnimatedAlertDialogTrigger asChild>
        <Button variant="destructive">Delete account</Button>
      </AnimatedAlertDialogTrigger>
      <AnimatedAlertDialogContent>
        <AnimatedAlertDialogHeader>
          <AnimatedAlertDialogTitle>Are you sure?</AnimatedAlertDialogTitle>
          <AnimatedAlertDialogDescription>
            This permanently deletes your account and all snapshots.
          </AnimatedAlertDialogDescription>
        </AnimatedAlertDialogHeader>
        <AnimatedAlertDialogFooter>
          <AnimatedAlertDialogCancel>Cancel</AnimatedAlertDialogCancel>
          <AnimatedAlertDialogAction variant="destructive">
            Delete
          </AnimatedAlertDialogAction>
        </AnimatedAlertDialogFooter>
      </AnimatedAlertDialogContent>
    </AnimatedAlertDialog>
  ),
};
