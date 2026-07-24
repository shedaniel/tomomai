import { createElement } from "react";
import { VideoEmbed, type VideoEmbedData } from "./video-embed";
import type { MarkdownExtension } from "./types";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const BILIBILI_ID = /^BV[A-Za-z0-9]{10}$/;

export function parseSupportedVideoUrl(url: string): VideoEmbedData | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    parsed.hash !== ""
  ) return null;

  if (parsed.hostname === "youtu.be") {
    const id = parsed.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    if (!id || parsed.search !== "") return null;
    return { provider: "youtube", id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
  }

  if (parsed.hostname === "youtube.com" || parsed.hostname === "www.youtube.com") {
    if (parsed.pathname !== "/watch" || Array.from(parsed.searchParams.keys()).length !== 1) return null;
    const id = parsed.searchParams.get("v");
    if (!id || !YOUTUBE_ID.test(id)) return null;
    return { provider: "youtube", id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
  }

  if (parsed.hostname === "bilibili.com" || parsed.hostname === "www.bilibili.com") {
    if (parsed.search !== "") return null;
    const id = parsed.pathname.match(/^\/video\/(BV[A-Za-z0-9]{10})\/?$/)?.[1];
    if (!id || !BILIBILI_ID.test(id)) return null;
    return { provider: "bilibili", id, embedUrl: `https://player.bilibili.com/player.html?bvid=${id}` };
  }

  return null;
}

export const videoEmbedExtension: MarkdownExtension = {
  id: "video-embed",
  resolveStandaloneUrl(url) {
    const video = parseSupportedVideoUrl(url.href);
    return video ? { key: `${video.provider}:${video.id}`, data: video } : null;
  },
  render(resolved) {
    return createElement(VideoEmbed, { video: resolved.data as VideoEmbedData, key: resolved.key });
  },
};
