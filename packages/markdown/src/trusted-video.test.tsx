import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExternalMarkdownLink, markdownBaseComponents } from "./trusted";
import { parseSupportedVideoUrl, videoEmbedExtension } from "./video";

describe("trusted Markdown presentation", () => {
  it("preserves base component visual output", () => {
    const { container } = render(
      <>
        {markdownBaseComponents.h2({ children: "Heading" })}
        {markdownBaseComponents.p({ children: "Paragraph" })}
        {markdownBaseComponents.strong({ children: "Strong" })}
        {markdownBaseComponents.table({ children: <tbody><tr><td>Cell</td></tr></tbody> })}
        {markdownBaseComponents.img({ src: "/image.png", alt: "Example" })}
      </>,
    );
    expect(container.querySelector("h2")?.className).toBe("text-2xl font-bold mt-8 mb-4");
    expect(container.querySelector("p")?.className).toBe("text-muted-foreground leading-relaxed mb-4");
    expect(container.querySelector("strong")?.className).toBe("font-semibold text-foreground");
    expect(container.querySelector("table")?.parentElement?.className).toBe("overflow-x-auto my-6 rounded-lg border border-border");
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("Example");
  });

  it("preserves trusted external-link styling and behavior", () => {
    render(<ExternalMarkdownLink href="https://example.com">Example</ExternalMarkdownLink>);
    const link = screen.getByRole("link", { name: "Example" });
    expect(link.className).toBe("text-primary hover:underline");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("video embeds", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://www.bilibili.com/video/BV1xx411c7mD", "bilibili", "BV1xx411c7mD", "https://player.bilibili.com/player.html?bvid=BV1xx411c7mD"],
    ["https://bilibili.com/video/BV1xx411c7mD", "bilibili", "BV1xx411c7mD", "https://player.bilibili.com/player.html?bvid=BV1xx411c7mD"],
  ])("accepts approved provider URL %s", (url, provider, id, embedUrl) => {
    expect(parseSupportedVideoUrl(url)).toEqual({ provider, id, embedUrl });
  });

  it.each([
    "http://youtu.be/dQw4w9WgXcQ",
    "https://youtube.com.attacker.invalid/watch?v=dQw4w9WgXcQ",
    "https://user@youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com:444/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1",
    "https://bilibili.com.attacker.invalid/video/BV1xx411c7mD",
    "https://www.bilibili.com/video/BV1xx411c7mD?autoplay=1",
  ])("rejects unsafe or unsupported provider URL %s", (url) => {
    expect(parseSupportedVideoUrl(url)).toBeNull();
  });

  it("creates no iframe until Load video is activated", () => {
    const parsed = parseSupportedVideoUrl("https://youtu.be/dQw4w9WgXcQ");
    if (!parsed) throw new Error("fixture must parse");
    const rendered = videoEmbedExtension.render({ key: "youtube:test", data: parsed });
    const { container } = render(<>{rendered}</>);
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("region", { name: "YouTube video" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Load video" }));
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe(parsed.embedUrl);
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-presentation");
    expect(iframe?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(iframe?.getAttribute("loading")).toBe("lazy");
    expect(iframe?.hasAttribute("allowfullscreen")).toBe(true);
  });
});
