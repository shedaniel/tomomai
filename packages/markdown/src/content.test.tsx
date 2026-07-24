import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownContent, PROFILE_MARKDOWN_POLICY } from "./content";
import type { MarkdownExtension, MarkdownPolicy } from "./types";

const restrictivePolicy: MarkdownPolicy = {
  allowedElements: PROFILE_MARKDOWN_POLICY.allowedElements,
  allowHttpsLinks: false,
};

describe("MarkdownContent", () => {
  it("renders the exact profile element policy and removes deceptive content", () => {
    const { container } = render(
      <MarkdownContent
        value={'# Fake system alert\n\n<button onclick="alert(1)">Verify</button>\n\n![tracker](https://attacker.invalid/pixel)\n\n```js\nalert(1)\n```\n\n**safe** `inline`'}
        policy={PROFILE_MARKDOWN_POLICY}
      />,
    );

    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("pre")).toBeNull();
    expect(container.textContent).not.toContain("alert(1)");
    expect(container.querySelector("strong")?.textContent).toBe("safe");
    expect(container.querySelector("code")?.textContent).toBe("inline");
  });

  it("strips unsafe destinations and gives HTTPS UGC links exact attributes", () => {
    const { container } = render(
      <MarkdownContent
        value={'[bad](javascript:alert(1)) [relative](/settings) [protocol](//example.com) [data](data:text/plain,x) [good](https://example.com/path)'}
        policy={PROFILE_MARKDOWN_POLICY}
      />,
    );

    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe("good");
    expect(links[0].getAttribute("href")).toBe("https://example.com/path");
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toBe("nofollow ugc noopener noreferrer");
    expect(container.textContent).toContain("bad");
    expect(container.textContent).toContain("relative");
  });

  it("honors a policy that disables even HTTPS links", () => {
    const { container } = render(<MarkdownContent value="[plain](https://example.com)" policy={restrictivePolicy} />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("plain");
  });

  it("uses only the first matching extension for a sole parsed HTTPS URL", () => {
    const firstResolve = vi.fn(() => ({ key: "first", data: "first" }));
    const secondResolve = vi.fn(() => ({ key: "second", data: "second" }));
    const extensions: readonly MarkdownExtension[] = [
      { id: "first", resolveStandaloneUrl: firstResolve, render: ({ data }) => createElement("aside", null, String(data)) },
      { id: "second", resolveStandaloneUrl: secondResolve, render: ({ data }) => createElement("aside", null, String(data)) },
    ];

    render(<MarkdownContent value="https://example.com/video" policy={PROFILE_MARKDOWN_POLICY} extensions={extensions} />);
    expect(screen.getByText("first").tagName).toBe("ASIDE");
    expect(firstResolve).toHaveBeenCalledOnce();
    expect(secondResolve).not.toHaveBeenCalled();
  });

  it("does not promote a URL mixed with other paragraph content", () => {
    const resolve = vi.fn(() => ({ key: "match", data: null }));
    const extension: MarkdownExtension = {
      id: "test",
      resolveStandaloneUrl: resolve,
      render: () => createElement("aside", null, "embedded"),
    };

    render(<MarkdownContent value="Watch https://example.com/video now" policy={PROFILE_MARKDOWN_POLICY} extensions={[extension]} />);
    expect(resolve).not.toHaveBeenCalled();
    expect(screen.queryByText("embedded")).toBeNull();
  });
});
