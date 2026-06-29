import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";
import {
  AnimatedDialog,
  AnimatedDialogClose,
  AnimatedDialogContent,
  AnimatedDialogDescription,
  AnimatedDialogFooter,
  AnimatedDialogHeader,
  AnimatedDialogTitle,
  AnimatedDialogTrigger,
} from "./animated-dialog";

const meta = {
  title: "UI/AnimatedDialog",
  component: AnimatedDialog,
  tags: ["autodocs"],
} satisfies Meta<typeof AnimatedDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <AnimatedDialog>
      <AnimatedDialogTrigger asChild>
        <Button variant="outline">Open animated dialog</Button>
      </AnimatedDialogTrigger>
      <AnimatedDialogContent>
        <AnimatedDialogHeader>
          <AnimatedDialogTitle>Spring-animated dialog</AnimatedDialogTitle>
          <AnimatedDialogDescription>
            Enters with a spring scale and fades out on close.
          </AnimatedDialogDescription>
        </AnimatedDialogHeader>
        <AnimatedDialogFooter>
          <AnimatedDialogClose asChild>
            <Button>Got it</Button>
          </AnimatedDialogClose>
        </AnimatedDialogFooter>
      </AnimatedDialogContent>
    </AnimatedDialog>
  ),
};
