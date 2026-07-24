import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MarkdownEditor } from "./editor";
import { PROFILE_MARKDOWN_POLICY } from "./content";

const limits = { maxCharacters: 100, maxUtf8Bytes: 200 };

function EditorHarness({ initial = "hello world", testLimits = limits }: { initial?: string; testLimits?: typeof limits }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <div data-testid="value">{value}</div>
      <MarkdownEditor value={value} onChange={setValue} limits={testLimits} policy={PROFILE_MARKDOWN_POLICY} />
    </>
  );
}

function select(start: number, end: number) {
  const textarea = screen.getByLabelText("Markdown source") as HTMLTextAreaElement;
  textarea.focus();
  fireEvent.select(textarea, { target: { selectionStart: start, selectionEnd: end } });
  return textarea;
}

describe("MarkdownEditor", () => {
  it.each([
    ["Bold", "**hello** world"],
    ["Italic", "*hello* world"],
    ["Strikethrough", "~~hello~~ world"],
    ["Link", "[hello](https://) world"],
  ])("wraps the current selection with %s", (label, expected) => {
    render(<EditorHarness />);
    select(0, 5);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByTestId("value").textContent).toBe(expected);
  });

  it.each([
    ["Unordered list", "- first\n- second"],
    ["Ordered list", "1. first\n2. second"],
    ["Blockquote", "> first\n> second"],
  ])("prefixes every selected line with %s", (label, expected) => {
    render(<EditorHarness initial={"first\nsecond"} />);
    select(0, 12);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByTestId("value").textContent).toBe(expected);
  });

  it("keeps toolbar actions disabled until a writable textarea selection exists", () => {
    render(<EditorHarness />);
    const bold = screen.getByRole("button", { name: "Bold" }) as HTMLButtonElement;
    expect(bold.disabled).toBe(true);
    select(0, 0);
    expect(bold.disabled).toBe(false);
  });

  it("blocks direct changes and paste that exceed either limit", () => {
    render(<EditorHarness initial="ok" testLimits={{ maxCharacters: 3, maxUtf8Bytes: 4 }} />);
    const textarea = select(2, 2);
    fireEvent.change(textarea, { target: { value: "toolong" } });
    expect(screen.getByTestId("value").textContent).toBe("ok");

    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { getData: () => "😀" } });
    textarea.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    expect(screen.getByTestId("value").textContent).toBe("ok");
  });

  it("shows both counters once either reaches 80 percent", () => {
    render(<EditorHarness initial="12345678" testLimits={{ maxCharacters: 10, maxUtf8Bytes: 100 }} />);
    expect(screen.getByRole("status").textContent).toBe("8 / 10 characters · 8 / 100 bytes");
  });

  it("uses one canonical textarea across responsive Write and Preview views", () => {
    render(<EditorHarness />);
    expect(screen.getAllByLabelText("Markdown source")).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByLabelText("Markdown preview").textContent).toContain("hello world");
  });
});
