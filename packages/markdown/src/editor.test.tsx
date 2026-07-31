import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownEditor, type MarkdownEditorLabels } from "./editor";
import { PROFILE_MARKDOWN_POLICY } from "./content";
import type { MarkdownExtension, MarkdownLimits, MarkdownPolicy } from "./types";

const limits: MarkdownLimits = { maxCharacters: 100, maxUtf8Bytes: 200 };

const mediaExtension: MarkdownExtension = {
  id: "test-media",
  resolveStandaloneUrl(url) {
    return url.hostname === "media.example" ? { key: url.href, data: url.href } : null;
  },
  render(resolved) {
    return <div data-testid="media-preview">Trusted media: {String(resolved.data)}</div>;
  },
};

function EditorHarness({
  initial = "hello world",
  testLimits = limits,
  policy = PROFILE_MARKDOWN_POLICY,
  extensions = [],
  disabled = false,
  labels,
}: {
  initial?: string;
  testLimits?: MarkdownLimits;
  policy?: MarkdownPolicy;
  extensions?: readonly MarkdownExtension[];
  disabled?: boolean;
  labels?: Partial<MarkdownEditorLabels>;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <div data-testid="value">{value}</div>
      <MarkdownEditor
        value={value}
        onChange={setValue}
        limits={testLimits}
        policy={policy}
        extensions={extensions}
        disabled={disabled}
        labels={labels}
      />
    </>
  );
}

function select(start: number, end: number) {
  const textarea = screen.getByLabelText("Markdown source") as HTMLTextAreaElement;
  fireEvent.focus(textarea);
  textarea.setSelectionRange(start, end);
  fireEvent.select(textarea);
  return textarea;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MarkdownEditor", () => {
  it.each([
    ["Bold", "**hello** world"],
    ["Italic", "*hello* world"],
    ["Strikethrough", "~~hello~~ world"],
  ])("wraps the current selection with %s and keeps it selected", async (label, expected) => {
    render(<EditorHarness />);
    const textarea = select(0, 5);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByTestId("value").textContent).toBe(expected);
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual(label === "Bold" ? [2, 7] : label === "Italic" ? [1, 6] : [2, 7]);
  });

  it.each([
    ["Bold", "**hello**", 0, 9],
    ["Bold", "**hello**", 2, 7],
    ["Italic", "*hello*", 0, 7],
    ["Strikethrough", "~~hello~~", 2, 7],
  ])("toggles %s off for wrapped or boundary-wrapped selections", (label, initial, start, end) => {
    render(<EditorHarness initial={initial} />);
    select(start, end);
    expect(screen.getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByTestId("value").textContent).toBe("hello");
  });

  it.each([
    ["Unordered list", "- first\n- second"],
    ["Ordered list", "1. first\n2. second"],
    ["Blockquote", "> first\n> second"],
  ])("toggles every selected line with %s", (label, formatted) => {
    const { unmount } = render(<EditorHarness initial={"first\nsecond"} />);
    select(0, 12);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByTestId("value").textContent).toBe(formatted);
    unmount();

    render(<EditorHarness initial={formatted} />);
    select(0, formatted.length);
    expect(screen.getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByTestId("value").textContent).toBe("first\nsecond");
  });

  it.each([
    ["b", true, false, "**hello** world"],
    ["i", false, true, "*hello* world"],
  ])("supports the Mod+%s formatting shortcut", (key, metaKey, ctrlKey, expected) => {
    render(<EditorHarness />);
    const textarea = select(0, 5);
    fireEvent.keyDown(textarea, { key, metaKey, ctrlKey });
    expect(screen.getByTestId("value").textContent).toBe(expected);
  });

  it("opens the link dialog with Mod+K and focuses the selected text field", () => {
    render(<EditorHarness />);
    const textarea = select(0, 5);
    fireEvent.keyDown(textarea, { key: "k", metaKey: true });
    const text = screen.getByLabelText("Text") as HTMLInputElement;
    expect(text.value).toBe("hello");
    expect(document.activeElement).toBe(text);
  });

  it("rejects unsafe link URLs, then inserts a valid absolute HTTPS link", async () => {
    render(<EditorHarness />);
    const textarea = select(0, 5);
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    const url = screen.getByLabelText("HTTPS URL");
    fireEvent.change(url, { target: { value: "http://example.com" } });
    fireEvent.submit(url.closest("form")!);
    expect(screen.getByRole("alert").textContent).toBe("Enter an absolute HTTPS URL.");
    expect(screen.getByTestId("value").textContent).toBe("hello world");

    fireEvent.change(url, { target: { value: "https://example.com/profile" } });
    fireEvent.submit(url.closest("form")!);
    expect(screen.getByTestId("value").textContent).toBe("[hello](https://example.com/profile) world");
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([1, 6]);
  });

  it("edits an existing selected link without nesting Markdown", () => {
    render(<EditorHarness initial="[hello](https://old.example/)" />);
    select(0, 29);
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    expect((screen.getByLabelText("Text") as HTMLInputElement).value).toBe("hello");
    fireEvent.change(screen.getByLabelText("HTTPS URL"), { target: { value: "https://new.example" } });
    fireEvent.submit(screen.getByLabelText("HTTPS URL").closest("form")!);
    expect(screen.getByTestId("value").textContent).toBe("[hello](https://new.example/)");
  });

  it("validates media through trusted extensions and inserts a standalone paragraph", () => {
    render(<EditorHarness initial={"before after"} extensions={[mediaExtension]} />);
    select(7, 7);
    fireEvent.click(screen.getByRole("button", { name: "Media" }));
    const url = screen.getByLabelText("Media URL");
    expect(document.activeElement).toBe(url);
    fireEvent.change(url, { target: { value: "https://unsupported.example/video" } });
    fireEvent.submit(url.closest("form")!);
    expect(screen.getByRole("alert").textContent).toBe("Enter a supported HTTPS media URL.");

    fireEvent.change(url, { target: { value: "https://media.example/video" } });
    fireEvent.submit(url.closest("form")!);
    expect(screen.getByTestId("value").textContent).toBe("before\n\nhttps://media.example/video\n\nafter");
  });

  it("inserts the extension's canonical URL instead of the pasted one", () => {
    const canonicalizing: MarkdownExtension = {
      id: "test-canonical",
      resolveStandaloneUrl: (url) =>
        url.hostname === "media.example"
          ? { key: url.href, data: url.href, canonicalUrl: "https://short.example/v1" }
          : null,
      render: (resolved) => <div>{String(resolved.data)}</div>,
    };
    render(<EditorHarness initial="" extensions={[canonicalizing]} />);
    select(0, 0);
    fireEvent.click(screen.getByRole("button", { name: "Media" }));
    const url = screen.getByLabelText("Media URL");
    fireEvent.change(url, { target: { value: "https://media.example/video?tracking=abcdefghijklmnop" } });
    fireEvent.submit(url.closest("form")!);
    expect(screen.getByTestId("value").textContent).toBe("https://short.example/v1");
  });

  it("cancels dialogs without changing source and restores focus and selection", async () => {
    render(<EditorHarness />);
    const textarea = select(1, 5);
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("value").textContent).toBe("hello world");
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([1, 5]);
  });

  it("shows visible feedback when direct input or paste exceeds each independent limit", () => {
    const { unmount } = render(<EditorHarness initial="ok" testLimits={{ maxCharacters: 3, maxUtf8Bytes: 20 }} />);
    const textarea = select(2, 2);
    fireEvent.change(textarea, { target: { value: "four" } });
    expect(screen.getByRole("alert").textContent).toBe("The character limit is 3.");
    expect(screen.getByTestId("value").textContent).toBe("ok");
    unmount();

    render(<EditorHarness initial="ok" testLimits={{ maxCharacters: 3, maxUtf8Bytes: 5 }} />);
    const pasteTarget = select(2, 2);
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { getData: () => "😀" } });
    fireEvent(pasteTarget, paste);
    expect(paste.defaultPrevented).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("The storage limit is 5 bytes.");
    expect(pasteTarget.getAttribute("aria-invalid")).toBe("true");
  });

  it("shows size feedback when a formatting action would exceed the limit", () => {
    render(<EditorHarness initial="abc" testLimits={{ maxCharacters: 4, maxUtf8Bytes: 20 }} />);
    select(0, 3);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(screen.getByTestId("value").textContent).toBe("abc");
    expect(screen.getByRole("alert").textContent).toBe("The character limit is 4.");
  });

  it("keeps controls grouped, labelled, and disabled with the editor", () => {
    render(<EditorHarness disabled extensions={[mediaExtension]} />);
    const toolbar = screen.getByRole("toolbar", { name: "Markdown formatting" });
    expect(within(toolbar).getAllByRole("group")).toHaveLength(3);
    for (const button of within(toolbar).getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Bold" }).getAttribute("aria-keyshortcuts")).toBe("Meta+B Control+B");
    expect(screen.getByRole("button", { name: "Link" }).getAttribute("aria-keyshortcuts")).toBe("Meta+K Control+K");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows both localized counters once either limit reaches 80 percent", () => {
    render(
      <EditorHarness
        initial="12345678"
        testLimits={{ maxCharacters: 10, maxUtf8Bytes: 100 }}
        labels={{ formatSizeStatus: (size) => `${size.characters} characters used` }}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("8 characters used");
  });

  it("uses one canonical textarea and the identical policy/extensions preview", () => {
    render(<EditorHarness initial="https://media.example/video" extensions={[mediaExtension]} />);
    expect(screen.getAllByLabelText("Markdown source")).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByTestId("media-preview").textContent).toContain("https://media.example/video");
  });

  it("does not promote extension media when the shared preview policy disallows HTTPS", () => {
    render(
      <EditorHarness
        initial="https://media.example/video"
        extensions={[mediaExtension]}
        policy={{ ...PROFILE_MARKDOWN_POLICY, allowHttpsLinks: false }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.queryByTestId("media-preview")).toBeNull();
  });

  it("switches to split view from actual container width without creating another textarea", async () => {
    class WideResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() {
        this.callback([{ contentRect: { width: 700 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", WideResizeObserver);
    render(<EditorHarness />);
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Preview" })).toBeNull());
    expect(screen.getAllByLabelText("Markdown source")).toHaveLength(1);
    expect(screen.getByLabelText("Markdown preview")).not.toBeNull();
  });
});
