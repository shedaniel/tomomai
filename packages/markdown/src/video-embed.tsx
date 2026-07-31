"use client";

import { useState } from "react";

export type VideoEmbedData = {
  provider: "youtube" | "bilibili";
  id: string;
  embedUrl: string;
  /** Shortest canonical form of the source URL, for storing in Markdown. */
  canonicalUrl: string;
};

export type VideoEmbedLabels = {
  loadVideo: string;
  formatRegionLabel(provider: string): string;
};

export const DEFAULT_VIDEO_EMBED_LABELS: VideoEmbedLabels = {
  loadVideo: "Load video",
  formatRegionLabel: (provider) => `${provider} video`,
};

export function VideoEmbed({
  video,
  labels = DEFAULT_VIDEO_EMBED_LABELS,
}: {
  video: VideoEmbedData;
  labels?: VideoEmbedLabels;
}) {
  const [loaded, setLoaded] = useState(false);
  const provider = video.provider === "youtube" ? "YouTube" : "bilibili";
  const label = labels.formatRegionLabel(provider);

  return (
    <section aria-label={label} className="my-4 aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted/40">
      {loaded ? (
        <iframe
          className="h-full w-full border-0"
          src={video.embedUrl}
          title={label}
          sandbox="allow-scripts allow-same-origin allow-presentation"
          // Providers validate the embedding origin from the Referer; sending
          // none makes YouTube fail with error 153. Origin-only still keeps the
          // profile path private.
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
          allow="fullscreen"
          allowFullScreen
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <button
            type="button"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => setLoaded(true)}
          >
            {labels.loadVideo}
          </button>
        </div>
      )}
    </section>
  );
}
