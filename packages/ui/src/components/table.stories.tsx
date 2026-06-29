import type { Meta, StoryObj } from "@storybook/react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

const meta = {
  title: "UI/Table",
  component: Table,
  tags: ["autodocs"],
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

const rows = [
  { song: "Oshama Scramble!", level: "14.6", score: "100.8534%" },
  { song: "PANDORA PARADOXXX", level: "15.0", score: "99.7421%" },
  { song: "World's End Umbrella", level: "13.8", score: "100.5012%" },
];

export const Default: Story = {
  render: () => (
    <Table className="w-[28rem]">
      <TableCaption>Your recent top plays.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Song</TableHead>
          <TableHead>Level</TableHead>
          <TableHead className="text-right">Score</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.song}>
            <TableCell className="font-medium">{r.song}</TableCell>
            <TableCell>{r.level}</TableCell>
            <TableCell className="text-right tabular-nums">{r.score}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>Average</TableCell>
          <TableCell className="text-right tabular-nums">100.3656%</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};
