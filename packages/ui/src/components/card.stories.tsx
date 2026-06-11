import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const meta = {
  title: "UI/Card",
  component: Card,
  tags: ["autodocs"],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Player rating</CardTitle>
        <CardDescription>Your current maimai DX rating.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm">
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tabular-nums">15,042</p>
      </CardContent>
      <CardFooter className="border-t">
        <p className="text-muted-foreground text-sm">Updated just now</p>
      </CardFooter>
    </Card>
  ),
};
