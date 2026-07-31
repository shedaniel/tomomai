"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@tomomai/ui";
import { MarkdownContent } from "./content";
import { measureMarkdown, validateMarkdownSize } from "./size";
import type {
  MarkdownExtension,
  MarkdownLimits,
  MarkdownPolicy,
  MarkdownSize,
  ResolvedStandaloneUrl,
} from "./types";

type Selection = { start: number; end: number };
type InlineAction = "bold" | "italic" | "strike";
type BlockAction = "unordered" | "ordered" | "quote";
type ToggleAction = InlineAction | BlockAction;
type DialogKind = "link" | "media";

type Transform = { value: string; selection: Selection };

export type MarkdownEditorLabels = {
  formattingToolbar: string;
  bold: string;
  italic: string;
  strikethrough: string;
  link: string;
  unorderedList: string;
  orderedList: string;
  blockquote: string;
  media: string;
  editorView: string;
  write: string;
  preview: string;
  previewAriaLabel: string;
  linkDialogTitle: string;
  linkDialogDescription: string;
  linkText: string;
  linkTextPlaceholder: string;
  linkUrl: string;
  linkUrlPlaceholder: string;
  invalidHttpsUrl: string;
  insertLink: string;
  mediaDialogTitle: string;
  mediaDialogDescription: string;
  mediaUrl: string;
  mediaUrlPlaceholder: string;
  unsupportedMediaUrl: string;
  insertMedia: string;
  cancel: string;
  formatSizeStatus(size: MarkdownSize, limits: MarkdownLimits): string;
  formatCharacterLimitExceeded(maxCharacters: number): string;
  formatByteLimitExceeded(maxUtf8Bytes: number): string;
};

export type MarkdownEditorProps = {
  value: string;
  onChange(value: string): void;
  limits: MarkdownLimits;
  policy: MarkdownPolicy;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  extensions?: readonly MarkdownExtension[];
  labels?: Partial<MarkdownEditorLabels>;
};

const DEFAULT_LABELS: MarkdownEditorLabels = {
  formattingToolbar: "Markdown formatting",
  bold: "Bold",
  italic: "Italic",
  strikethrough: "Strikethrough",
  link: "Link",
  unorderedList: "Unordered list",
  orderedList: "Ordered list",
  blockquote: "Blockquote",
  media: "Media",
  editorView: "Markdown editor view",
  write: "Write",
  preview: "Preview",
  previewAriaLabel: "Markdown preview",
  linkDialogTitle: "Insert link",
  linkDialogDescription: "Add readable text and an absolute HTTPS address.",
  linkText: "Text",
  linkTextPlaceholder: "Link text",
  linkUrl: "HTTPS URL",
  linkUrlPlaceholder: "https://example.com",
  invalidHttpsUrl: "Enter an absolute HTTPS URL.",
  insertLink: "Insert link",
  mediaDialogTitle: "Insert media",
  mediaDialogDescription: "Paste a supported media URL. It will appear as its own paragraph.",
  mediaUrl: "Media URL",
  mediaUrlPlaceholder: "https://",
  unsupportedMediaUrl: "Enter a supported HTTPS media URL.",
  insertMedia: "Insert media",
  cancel: "Cancel",
  formatSizeStatus: (size, limits) =>
    `${size.characters} / ${limits.maxCharacters} characters · ${size.utf8Bytes} / ${limits.maxUtf8Bytes} bytes`,
  formatCharacterLimitExceeded: (limit) => `The character limit is ${limit}.`,
  formatByteLimitExceeded: (limit) => `The storage limit is ${limit} bytes.`,
};

const INLINE_ACTIONS: readonly { action: InlineAction; label: keyof MarkdownEditorLabels; text: string }[] = [
  { action: "bold", label: "bold", text: "B" },
  { action: "italic", label: "italic", text: "I" },
  { action: "strike", label: "strikethrough", text: "S" },
];

const BLOCK_ACTIONS: readonly { action: BlockAction; label: keyof MarkdownEditorLabels; text: string }[] = [
  { action: "unordered", label: "unorderedList", text: "• List" },
  { action: "ordered", label: "orderedList", text: "1. List" },
  { action: "quote", label: "blockquote", text: "Quote" },
];

const INLINE_MARKERS: Record<InlineAction, string> = { bold: "**", italic: "*", strike: "~~" };
const SPLIT_VIEW_MIN_WIDTH = 640;

function isWholeWrapped(selected: string, marker: string) {
  if (selected.length < marker.length * 2 || !selected.startsWith(marker) || !selected.endsWith(marker)) return false;
  return marker !== "*" || (!selected.startsWith("**") && !selected.endsWith("**"));
}

function isBoundaryWrapped(value: string, selection: Selection, marker: string) {
  const before = value.slice(0, selection.start);
  const after = value.slice(selection.end);
  if (!before.endsWith(marker) || !after.startsWith(marker)) return false;
  if (marker !== "*") return true;
  return value[selection.start - 2] !== "*" && value[selection.end + 1] !== "*";
}

function toggleWrappedSelection(value: string, selection: Selection, marker: string): Transform {
  const selected = value.slice(selection.start, selection.end);
  if (isWholeWrapped(selected, marker)) {
    const inner = selected.slice(marker.length, -marker.length);
    return {
      value: `${value.slice(0, selection.start)}${inner}${value.slice(selection.end)}`,
      selection: { start: selection.start, end: selection.start + inner.length },
    };
  }
  if (isBoundaryWrapped(value, selection, marker)) {
    return {
      value: `${value.slice(0, selection.start - marker.length)}${selected}${value.slice(selection.end + marker.length)}`,
      selection: { start: selection.start - marker.length, end: selection.end - marker.length },
    };
  }
  return {
    value: `${value.slice(0, selection.start)}${marker}${selected}${marker}${value.slice(selection.end)}`,
    selection: { start: selection.start + marker.length, end: selection.end + marker.length },
  };
}

function selectedLineRange(value: string, selection: Selection) {
  const start = value.lastIndexOf("\n", Math.max(0, selection.start - 1)) + 1;
  const effectiveEnd = selection.end > start && value[selection.end - 1] === "\n" ? selection.end - 1 : selection.end;
  const nextBreak = value.indexOf("\n", effectiveEnd);
  return { start, end: nextBreak === -1 ? value.length : nextBreak };
}

function blockPattern(action: BlockAction) {
  if (action === "unordered") return /^(\s*)[-*+] /;
  if (action === "ordered") return /^(\s*)\d+\. /;
  return /^(\s*)> /;
}

function togglePrefixedLines(value: string, selection: Selection, action: BlockAction): Transform {
  const range = selectedLineRange(value, selection);
  const lines = value.slice(range.start, range.end).split("\n");
  const pattern = blockPattern(action);
  const remove = lines.every((line) => pattern.test(line));
  const replacement = lines.map((line, index) => {
    if (remove) return line.replace(pattern, "$1");
    const prefix = action === "unordered" ? "- " : action === "ordered" ? `${index + 1}. ` : "> ";
    return line.replace(/^(\s*)/, `$1${prefix}`);
  }).join("\n");
  return {
    value: `${value.slice(0, range.start)}${replacement}${value.slice(range.end)}`,
    selection: { start: range.start, end: range.start + replacement.length },
  };
}

function applyToggle(value: string, selection: Selection, action: ToggleAction) {
  return action in INLINE_MARKERS
    ? toggleWrappedSelection(value, selection, INLINE_MARKERS[action as InlineAction])
    : togglePrefixedLines(value, selection, action as BlockAction);
}

function actionIsPressed(value: string, selection: Selection, action: ToggleAction) {
  if (action in INLINE_MARKERS) {
    const marker = INLINE_MARKERS[action as InlineAction];
    return isWholeWrapped(value.slice(selection.start, selection.end), marker)
      || isBoundaryWrapped(value, selection, marker);
  }
  const range = selectedLineRange(value, selection);
  return value.slice(range.start, range.end).split("\n").every((line) => blockPattern(action as BlockAction).test(line));
}

function parseAbsoluteHttpsUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function readLinkSelection(value: string, selection: Selection) {
  const selected = value.slice(selection.start, selection.end);
  const complete = selected.match(/^\[([^\]]*)\]\((https:[^)]+)\)$/);
  if (complete) return { text: complete[1], url: complete[2], range: selection };

  if (value[selection.start - 1] === "[") {
    const suffix = value.slice(selection.end).match(/^\]\((https:[^)]+)\)/);
    if (suffix) {
      return {
        text: selected,
        url: suffix[1],
        range: { start: selection.start - 1, end: selection.end + suffix[0].length },
      };
    }
  }
  return { text: selected, url: "", range: selection };
}

function escapeLinkText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function insertStandaloneParagraph(value: string, selection: Selection, url: string): Transform {
  const before = value.slice(0, selection.start).trimEnd();
  const after = value.slice(selection.end).trimStart();
  const next = [before, url, after].filter(Boolean).join("\n\n");
  const start = before ? before.length + 2 : 0;
  return { value: next, selection: { start: start + url.length, end: start + url.length } };
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
  labels: labelOverrides,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogSelection = useRef<Selection | null>(null);
  const pendingSelection = useRef<Selection | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [view, setView] = useState("write");
  const [splitView, setSplitView] = useState(false);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [sizeRejection, setSizeRejection] = useState<string | null>(null);
  const dialogErrorId = useId();
  const labels = useMemo(() => ({ ...DEFAULT_LABELS, ...labelOverrides }), [labelOverrides]);
  const size = useMemo(() => measureMarkdown(value), [value]);
  const showCounter = size.characters >= limits.maxCharacters * 0.8 || size.utf8Bytes >= limits.maxUtf8Bytes * 0.8;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setSplitView(entry.contentRect.width >= SPLIT_VIEW_MIN_WIDTH));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const syncSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) setSelection({ start: textarea.selectionStart, end: textarea.selectionEnd });
  }, []);

  const restoreSelection = useCallback((next: Selection) => {
    pendingSelection.current = next;
  }, []);

  useLayoutEffect(() => {
    const next = pendingSelection.current;
    const textarea = textareaRef.current;
    if (!next || !textarea) return;
    pendingSelection.current = null;
    textarea.focus();
    textarea.setSelectionRange(next.start, next.end);
    setSelection(next);
  }, [dialog, value]);

  const limitMessage = useCallback((nextValue: string) => {
    const result = validateMarkdownSize(nextValue, limits);
    if (result.ok) return null;
    return result.exceeded === "characters"
      ? labels.formatCharacterLimitExceeded(limits.maxCharacters)
      : labels.formatByteLimitExceeded(limits.maxUtf8Bytes);
  }, [labels, limits]);

  const applyTransform = useCallback((transform: Transform) => {
    const error = limitMessage(transform.value);
    if (error) {
      setSizeRejection(error);
      return false;
    }
    setSizeRejection(null);
    onChange(transform.value);
    restoreSelection(transform.selection);
    return true;
  }, [limitMessage, onChange, restoreSelection]);

  const runToggle = useCallback((action: ToggleAction, currentSelection = selection) => {
    if (disabled || currentSelection === null) return;
    applyTransform(applyToggle(value, currentSelection, action));
  }, [applyTransform, disabled, selection, value]);

  const openLinkDialog = useCallback((currentSelection = selection) => {
    if (disabled || currentSelection === null) return;
    const draft = readLinkSelection(value, currentSelection);
    dialogSelection.current = draft.range;
    setLinkText(draft.text);
    setLinkUrl(draft.url);
    setDialogError(null);
    setDialog("link");
  }, [disabled, selection, value]);

  const openMediaDialog = useCallback((currentSelection = selection) => {
    if (disabled || currentSelection === null) return;
    dialogSelection.current = currentSelection;
    const selected = value.slice(currentSelection.start, currentSelection.end).trim();
    setMediaUrl(parseAbsoluteHttpsUrl(selected) ? selected : "");
    setDialogError(null);
    setDialog("media");
  }, [disabled, selection, value]);

  const dismissDialog = useCallback(() => {
    const previous = dialogSelection.current;
    setDialog(null);
    setDialogError(null);
    if (previous) restoreSelection(previous);
  }, [restoreSelection]);

  const acceptInput = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.currentTarget.value;
    const error = limitMessage(next);
    if (error) {
      setSizeRejection(error);
      return;
    }
    setSizeRejection(null);
    onChange(next);
  };

  const guardPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    const pasted = event.clipboardData.getData("text");
    const next = `${value.slice(0, textarea.selectionStart)}${pasted}${value.slice(textarea.selectionEnd)}`;
    const error = limitMessage(next);
    if (!error) return;
    event.preventDefault();
    setSizeRejection(error);
  };

  const handleShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled || (!event.metaKey && !event.ctrlKey) || event.altKey) return;
    const currentSelection = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
    const key = event.key.toLowerCase();
    if (key === "b" || key === "i") {
      event.preventDefault();
      runToggle(key === "b" ? "bold" : "italic", currentSelection);
    } else if (key === "k") {
      event.preventDefault();
      openLinkDialog(currentSelection);
    }
  };

  const submitLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const range = dialogSelection.current;
    const url = parseAbsoluteHttpsUrl(linkUrl.trim());
    if (!range || !linkText.trim() || !url) {
      if (!url) setDialogError(labels.invalidHttpsUrl);
      return;
    }
    const markdown = `[${escapeLinkText(linkText.trim())}](${url.href})`;
    const transform = {
      value: `${value.slice(0, range.start)}${markdown}${value.slice(range.end)}`,
      selection: { start: range.start + 1, end: range.start + 1 + escapeLinkText(linkText.trim()).length },
    };
    const error = limitMessage(transform.value);
    if (error) {
      setDialogError(error);
      return;
    }
    setSizeRejection(null);
    onChange(transform.value);
    setDialog(null);
    restoreSelection(transform.selection);
  };

  const submitMedia = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const range = dialogSelection.current;
    const url = parseAbsoluteHttpsUrl(mediaUrl.trim());
    const resolved = url
      ? extensions.reduce<ResolvedStandaloneUrl | null>(
          (found, extension) => found ?? extension.resolveStandaloneUrl(url),
          null,
        )
      : null;
    if (!range || !url || !resolved) {
      setDialogError(labels.unsupportedMediaUrl);
      return;
    }
    // Store the canonical form so tracking params don't eat the size budget.
    const transform = insertStandaloneParagraph(value, range, resolved.canonicalUrl ?? url.href);
    const error = limitMessage(transform.value);
    if (error) {
      setDialogError(error);
      return;
    }
    setSizeRejection(null);
    onChange(transform.value);
    setDialog(null);
    restoreSelection(transform.selection);
  };

  const writable = !disabled && selection !== null;
  const inlineGroupLabel = [labels.bold, labels.italic, labels.strikethrough].join(", ");
  const blockGroupLabel = [labels.unorderedList, labels.orderedList, labels.blockquote].join(", ");
  const insertionGroupLabel = [labels.link, labels.media].join(", ");

  const source = (
    <Textarea
      ref={textareaRef}
      id={id}
      aria-label={ariaLabel}
      aria-describedby={sizeRejection ? `${id ?? "markdown-editor"}-size-error` : undefined}
      aria-invalid={sizeRejection ? true : undefined}
      value={value}
      onChange={acceptInput}
      onPaste={guardPaste}
      onSelect={syncSelection}
      onKeyUp={syncSelection}
      onKeyDown={handleShortcut}
      onClick={syncSelection}
      onFocus={syncSelection}
      disabled={disabled}
      placeholder={placeholder}
      className="min-h-56 resize-y font-mono leading-relaxed"
    />
  );
  const preview = (
    <div aria-label={labels.previewAriaLabel} className="min-h-56 rounded-lg border border-border bg-muted/20 p-3">
      <MarkdownContent value={value} policy={policy} extensions={extensions} />
    </div>
  );

  return (
    <div ref={containerRef} className="space-y-2">
      <div role="toolbar" aria-label={labels.formattingToolbar} className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1.5">
        <div role="group" aria-label={inlineGroupLabel} className="flex gap-1">
          {INLINE_ACTIONS.map(({ action, label, text }) => (
            <Button
              key={action}
              type="button"
              variant="ghost"
              size="sm"
              aria-label={labels[label] as string}
              aria-pressed={selection ? actionIsPressed(value, selection, action) : false}
              aria-keyshortcuts={action === "bold" ? "Meta+B Control+B" : action === "italic" ? "Meta+I Control+I" : undefined}
              disabled={!writable}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runToggle(action)}
              className={action === "italic" ? "italic" : action === "strike" ? "line-through" : undefined}
            >
              {text}
            </Button>
          ))}
        </div>
        <div role="group" aria-label={blockGroupLabel} className="flex gap-1">
          {BLOCK_ACTIONS.map(({ action, label, text }) => (
            <Button
              key={action}
              type="button"
              variant="ghost"
              size="sm"
              aria-label={labels[label] as string}
              aria-pressed={selection ? actionIsPressed(value, selection, action) : false}
              disabled={!writable}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runToggle(action)}
            >
              {text}
            </Button>
          ))}
        </div>
        <div role="group" aria-label={insertionGroupLabel} className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={labels.link}
            aria-keyshortcuts="Meta+K Control+K"
            disabled={!writable}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => openLinkDialog()}
          >
            {labels.link}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={labels.media}
            disabled={!writable || extensions.length === 0}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => openMediaDialog()}
          >
            {labels.media}
          </Button>
        </div>
      </div>

      <Tabs value={view} onValueChange={setView}>
        {!splitView ? (
          <TabsList aria-label={labels.editorView} className="grid w-full grid-cols-2">
            <TabsTrigger value="write">{labels.write}</TabsTrigger>
            <TabsTrigger value="preview">{labels.preview}</TabsTrigger>
          </TabsList>
        ) : null}

        <div className={splitView ? "mt-2 grid grid-cols-2 gap-3" : "mt-2"}>
          <div className={!splitView && view !== "write" ? "hidden" : "block"}>
            {splitView ? <p className="mb-2 text-xs font-medium text-muted-foreground">{labels.write}</p> : null}
            {source}
          </div>
          <div className={!splitView && view !== "preview" ? "hidden" : "block"}>
            {splitView ? <p className="mb-2 text-xs font-medium text-muted-foreground">{labels.preview}</p> : null}
            {preview}
          </div>
        </div>
      </Tabs>

      {sizeRejection ? (
        <p id={`${id ?? "markdown-editor"}-size-error`} role="alert" className="text-sm text-destructive">
          {sizeRejection}
        </p>
      ) : null}
      {showCounter ? (
        <p role="status" className="text-right text-xs tabular-nums text-muted-foreground">
          {labels.formatSizeStatus(size, limits)}
        </p>
      ) : null}

      <Dialog open={dialog === "link"} onOpenChange={(open) => { if (!open) dismissDialog(); }}>
        <DialogContent showCloseButton={false} onCloseAutoFocus={(event) => event.preventDefault()}>
          <form onSubmit={submitLink} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{labels.linkDialogTitle}</DialogTitle>
              <DialogDescription>{labels.linkDialogDescription}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor={`${dialogErrorId}-link-text`}>{labels.linkText}</Label>
              <Input
                id={`${dialogErrorId}-link-text`}
                value={linkText}
                onChange={(event) => { setLinkText(event.currentTarget.value); setDialogError(null); }}
                placeholder={labels.linkTextPlaceholder}
                required
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${dialogErrorId}-link-url`}>{labels.linkUrl}</Label>
              <Input
                id={`${dialogErrorId}-link-url`}
                type="url"
                inputMode="url"
                value={linkUrl}
                onChange={(event) => { setLinkUrl(event.currentTarget.value); setDialogError(null); }}
                placeholder={labels.linkUrlPlaceholder}
                aria-invalid={dialogError ? true : undefined}
                aria-describedby={dialogError ? dialogErrorId : undefined}
                required
              />
              {dialogError ? <p id={dialogErrorId} role="alert" className="text-sm text-destructive">{dialogError}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={dismissDialog}>{labels.cancel}</Button>
              <Button type="submit">{labels.insertLink}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "media"} onOpenChange={(open) => { if (!open) dismissDialog(); }}>
        <DialogContent showCloseButton={false} onCloseAutoFocus={(event) => event.preventDefault()}>
          <form onSubmit={submitMedia} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{labels.mediaDialogTitle}</DialogTitle>
              <DialogDescription>{labels.mediaDialogDescription}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor={`${dialogErrorId}-media-url`}>{labels.mediaUrl}</Label>
              <Input
                id={`${dialogErrorId}-media-url`}
                type="url"
                inputMode="url"
                value={mediaUrl}
                onChange={(event) => { setMediaUrl(event.currentTarget.value); setDialogError(null); }}
                placeholder={labels.mediaUrlPlaceholder}
                aria-invalid={dialogError ? true : undefined}
                aria-describedby={dialogError ? dialogErrorId : undefined}
                required
                autoFocus
              />
              {dialogError ? <p id={dialogErrorId} role="alert" className="text-sm text-destructive">{dialogError}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={dismissDialog}>{labels.cancel}</Button>
              <Button type="submit">{labels.insertMedia}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
