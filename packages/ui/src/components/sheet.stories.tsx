import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

const meta = {
  title: "UI/Sheet",
  component: Sheet,
  tags: ["autodocs"],
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const Demo = ({ side }: { side: "top" | "right" | "bottom" | "left" }) => (
  <Sheet>
    <SheetTrigger asChild>
      <Button variant="outline">Open {side}</Button>
    </SheetTrigger>
    <SheetContent side={side}>
      <SheetHeader>
        <SheetTitle>Edit profile</SheetTitle>
        <SheetDescription>
          Make changes to your profile here. Click save when you're done.
        </SheetDescription>
      </SheetHeader>
      <div className="grid gap-2 px-4">
        <Label htmlFor="sheet-name">Name</Label>
        <Input id="sheet-name" defaultValue="maimai player" />
      </div>
      <SheetFooter>
        <Button>Save changes</Button>
        <SheetClose asChild>
          <Button variant="outline">Close</Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);

export const Right: Story = { render: () => <Demo side="right" /> };
export const Left: Story = { render: () => <Demo side="left" /> };

export const AllSides: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Demo side="top" />
      <Demo side="right" />
      <Demo side="bottom" />
      <Demo side="left" />
    </div>
  ),
};
