import { createElement } from "react";
import { VideoEmbed, type VideoEmbedData, type VideoEmbedLabels } from "./video-embed";
import type { MarkdownExtension } from "./types";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const BILIBILI_ID = /^BV[A-Za-z0-9]{10}$/;

function youtube(id: string): VideoEmbedData {
  return {
    provider: "youtube",
    id,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    canonicalUrl: `https://youtu.be/${id}`,
  };
}

function bilibili(id: string): VideoEmbedData {
  return {
    provider: "bilibili",
    id,
    embedUrl: `https://player.bilibili.com/player.html?bvid=${id}`,
    canonicalUrl: `https://bilibili.com/video/${id}`,
  };
}

/**
 * Extra query params and fragments (tracking junk like `&pp=`, `&si=`) are
 * ignored rather than rejected: the embed and canonical URLs are rebuilt from
 * the strictly validated id, so nothing from the source URL is carried over.
 * Host, scheme, credentials and port stay strict.
 */
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
    parsed.port !== ""
  ) return null;

  if (parsed.hostname === "youtu.be") {
    const id = parsed.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    return id ? youtube(id) : null;
  }

  if (parsed.hostname === "youtube.com" || parsed.hostname === "www.youtube.com") {
    if (parsed.pathname !== "/watch") return null;
    const id = parsed.searchParams.get("v");
    return id && YOUTUBE_ID.test(id) ? youtube(id) : null;
  }

  if (parsed.hostname === "bilibili.com" || parsed.hostname === "www.bilibili.com") {
    const id = parsed.pathname.match(/^\/video\/(BV[A-Za-z0-9]{10})\/?$/)?.[1];
    return id && BILIBILI_ID.test(id) ? bilibili(id) : null;
  }

  return null;
}

export function createVideoEmbedExtension(labels?: VideoEmbedLabels): MarkdownExtension {
  return {
    id: "video-embed",
    resolveStandaloneUrl(url) {
      const video = parseSupportedVideoUrl(url.href);
      if (!video) return null;
      return {
        key: `${video.provider}:${video.id}`,
        data: video,
        canonicalUrl: video.canonicalUrl,
      };
    },
    render(resolved) {
      return createElement(VideoEmbed, {
        video: resolved.data as VideoEmbedData,
        labels,
        key: resolved.key,
      });
    },
  };
}

/** English-labelled extension, for callers without a translation scope. */
export const videoEmbedExtension = createVideoEmbedExtension();
