"use client";

import { useCallback, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { Button, Tabs, TabsList, TabsTrigger, Textarea } from "@tomomai/ui";
import { MarkdownContent } from "./content";
import { measureMarkdown, validateMarkdownSize } from "./size";
import type { MarkdownExtension, MarkdownLimits, MarkdownPolicy } from "./types";

type Selection = { start: number; end: number };
type ToolbarAction = "bold" | "italic" | "strike" | "link" | "unordered" | "ordered" | "quote";

const TOOLBAR: readonly { action: ToolbarAction; label: string; text: string }[] = [
  { action: "bold", label: "Bold", text: "B" },
  { action: "italic", label: "Italic", text: "I" },
  { action: "strike", label: "Strikethrough", text: "S" },
  { action: "link", label: "Link", text: "Link" },
  { action: "unordered", label: "Unordered list", text: "• List" },
  { action: "ordered", label: "Ordered list", text: "1. List" },
  { action: "quote", label: "Blockquote", text: "Quote" },
];

function wrapSelection(value: string, selection: Selection, before: string, after: string) {
  const selected = value.slice(selection.start, selection.end);
  return {
    value: `${value.slice(0, selection.start)}${before}${selected}${after}${value.slice(selection.end)}`,
    selection: { start: selection.start + before.length, end: selection.end + before.length },
  };
}

function prefixSelectedLines(value: string, selection: Selection, prefix: (index: number) => string) {
  const lineStart = value.lastIndexOf("\n", Math.max(0, selection.start - 1)) + 1;
  const nextBreak = value.indexOf("\n", selection.end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const replacement = value.slice(lineStart, lineEnd).split("\n").map((line, index) => `${prefix(index)}${line}`).join("\n");
  return {
    value: `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
    selection: { start: lineStart, end: lineStart + replacement.length },
  };
}

function applyAction(value: string, selection: Selection, action: ToolbarAction) {
  switch (action) {
    case "bold": return wrapSelection(value, selection, "**", "**");
    case "italic": return wrapSelection(value, selection, "*", "*");
    case "strike": return wrapSelection(value, selection, "~~", "~~");
    case "link": return wrapSelection(value, selection, "[", "](https://)");
    case "unordered": return prefixSelectedLines(value, selection, () => "- ");
    case "ordered": return prefixSelectedLines(value, selection, (index) => `${index + 1}. `);
    case "quote": return prefixSelectedLines(value, selection, () => "> ");
  }
}

function actionIsPressed(value: string, selection: Selection, action: ToolbarAction) {
  const before = value.slice(0, selection.start);
  const after = value.slice(selection.end);
  if (action === "bold") return before.endsWith("**") && after.startsWith("**");
  if (action === "italic") return before.endsWith("*") && after.startsWith("*");
  if (action === "strike") return before.endsWith("~~") && after.startsWith("~~");
  if (action === "link") return before.endsWith("[") && after.startsWith("](");
  const line = value.slice(value.lastIndexOf("\n", Math.max(0, selection.start - 1)) + 1, selection.start);
  if (action === "unordered") return /^\s*[-*+] /.test(line);
  if (action === "ordered") return /^\s*\d+\. /.test(line);
  return /^\s*> /.test(line);
}

export function MarkdownEditor({
  value,
  onChange,
  limits,
  policy,
  disabled = false,
  id,
  ariaLabel = "Markdown source",
  placeholder,
  extensions = [],
}: {
  value: string;
  onChange(value: string): void;
  limits: MarkdownLimits;
  policy: MarkdownPolicy;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  extensions?: readonly MarkdownExtension[];
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [view, setView] = useState("write");
  const size = useMemo(() => measureMarkdown(value), [value]);
  const showCounter = size.characters >= limits.maxCharacters * 0.8 || size.utf8Bytes >= limits.maxUtf8Bytes * 0.8;


  const syncSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) setSelection({ start: textarea.selectionStart, end: textarea.selectionEnd });
  }, []);

  const restoreSelection = useCallback((next: Selection) => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(next.start, next.end);
      setSelection(next);
    });
  }, []);

  const runAction = (action: ToolbarAction) => {
    if (disabled || selection === null) return;
    const result = applyAction(value, selection, action);
    if (!validateMarkdownSize(result.value, limits).ok) return;
    onChange(result.value);
    restoreSelection(result.selection);
  };

  const acceptInput = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.currentTarget.value;
    if (validateMarkdownSize(next, limits).ok) onChange(next);
  };

  const guardPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    const pasted = event.clipboardData.getData("text");
    const next = `${value.slice(0, textarea.selectionStart)}${pasted}${value.slice(textarea.selectionEnd)}`;
    if (!validateMarkdownSize(next, limits).ok) event.preventDefault();
  };

  const source = (
    <Textarea
      ref={textareaRef}
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={acceptInput}
      onPaste={guardPaste}
      onSelect={syncSelection}
      onKeyUp={syncSelection}
      onClick={syncSelection}
      disabled={disabled}
      placeholder={placeholder}
      className="min-h-56 resize-y font-mono leading-relaxed"
    />
  );
  const preview = (
    <div aria-label="Markdown preview" className="min-h-56 rounded-lg border border-border bg-muted/20 p-3">
      <MarkdownContent value={value} policy={policy} extensions={extensions} />
    </div>
  );

  return (
    <div className="space-y-2">
      <div role="toolbar" aria-label="Markdown formatting" className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1.5">
        {TOOLBAR.map(({ action, label, text }) => (
          <Button
            key={action}
            type="button"
            variant="ghost"
            size="sm"
            aria-label={label}
            aria-pressed={selection ? actionIsPressed(value, selection, action) : false}
            disabled={disabled || selection === null}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runAction(action)}
            className={action === "italic" ? "italic" : action === "strike" ? "line-through" : undefined}
          >
            {text}
          </Button>
        ))}
      </div>

      <Tabs value={view} onValueChange={setView}>
        <TabsList aria-label="Markdown editor view" className="grid w-full grid-cols-2 md:hidden">
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <div className="mt-2 gap-3 md:grid md:grid-cols-2">
          <div className={view === "write" ? "block" : "hidden md:block"}>
            <p className="mb-2 hidden text-xs font-medium text-muted-foreground md:block">Write</p>
            {source}
          </div>
          <div className={view === "preview" ? "block" : "hidden md:block"}>
            <p className="mb-2 hidden text-xs font-medium text-muted-foreground md:block">Preview</p>
            {preview}
          </div>
        </div>
      </Tabs>

      {showCounter ? (
        <p role="status" className="text-right text-xs tabular-nums text-muted-foreground">
          {size.characters} / {limits.maxCharacters} characters · {size.utf8Bytes} / {limits.maxUtf8Bytes} bytes
        </p>
      ) : null}
    </div>
  );
}
