import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { NET_TITLE_TYPES } from "../title-types";
import styles from "./collection.module.css";

const INK = "#4b3a2f";

export const NET_ICON_ART = [
  "default", "smug", "brace", "php", "error", "washer", "coin", "glove", "tap", "cookie",
] as const;
export type NetIconArt = (typeof NET_ICON_ART)[number];

function Svg({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {children}
    </svg>
  );
}

/** tomomai AI, the pink cat blob. `smug` gives it the half-lidded look it wears in most of /net. */
export function NetTomomaiAi({ mood = "smug" }: { mood?: "smug" | "bored" }) {
  return (
    <>
      <ellipse cx="32" cy="59" rx="18" ry="3" fill="#00000018" />
      <path d="M9 36c0-15 10-26 23-26s23 11 23 26-10 20-23 20S9 51 9 36z" fill="#ffd6e6" stroke={INK} strokeWidth={2.5} />
      <path d="M16 16l-3-9 9 5M48 16l3-9-9 5" fill="#ffd6e6" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      {mood === "smug" ? (
        <>
          <path d="M20 31l8-1M44 28l-8 2" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
          <path d="M20 38q4-3 8 0M36 38q4-3 8 0" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
          <path d="M27 47q7 3 12-3" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M20 37h8M36 37h8" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
          <path d="M28 47h8" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
        </>
      )}
      <ellipse cx="17" cy="44" rx="4" ry="2.2" fill="#ff8fb0" opacity={0.7} />
      <ellipse cx="47" cy="44" rx="4" ry="2.2" fill="#ff8fb0" opacity={0.7} />
    </>
  );
}

const ICON_PARTS: Readonly<Record<NetIconArt, ReactNode>> = {
  default: (
    <>
      <circle cx="32" cy="24" r="11" fill="#2f7fe8" />
      <path d="M12 60c0-13 9-21 20-21s20 8 20 21z" fill="#2f7fe8" />
    </>
  ),
  smug: <NetTomomaiAi />,
  brace: (
    <>
      <path d="M22 4h20l-2 56H24z" fill="#ffd9b8" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
      <rect x="18" y="22" width="28" height="24" rx="5" fill="#3a6fd8" stroke={INK} strokeWidth={2.2} />
      <path d="M18 28h28M18 40h28" stroke="#9cc3ff" strokeWidth={3} />
      <rect x="38" y="25" width="10" height="6" rx="2" fill="#e8eef9" stroke={INK} strokeWidth={1.6} />
      <rect x="38" y="37" width="10" height="6" rx="2" fill="#e8eef9" stroke={INK} strokeWidth={1.6} />
    </>
  ),
  php: (
    <>
      <path d="M12 26c0-8 8-14 22-14 12 0 20 6 20 16v16H40v8h-6v-8H24v8h-6v-8c-4-2-6-8-6-18z" fill="#f7a8c8" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
      <path d="M12 28c-6 2-8 10-6 18q3 4 6 1-2-8 2-12" fill="#f7a8c8" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
      <path d="M24 16c-6 0-8 6-6 12 4 4 10 2 10-4" fill="#e283ab" stroke={INK} strokeWidth={2} />
      <circle cx="17" cy="24" r="1.8" fill={INK} />
      <path d="M36 20v-8M32 12h8" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
    </>
  ),
  error: (
    <>
      <rect x="6" y="10" width="52" height="42" rx="4" fill="#fff" stroke={INK} strokeWidth={2.4} />
      <path d="M6 14a4 4 0 0 1 4-4h44a4 4 0 0 1 4 4v5H6z" fill="#ff5a6e" stroke={INK} strokeWidth={2.4} />
      <path d="M32 24l12 20H20z" fill="#ffd23a" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
      <path d="M32 30v7" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <circle cx="32" cy="40.5" r="1.6" fill={INK} />
    </>
  ),
  washer: (
    <>
      <rect x="10" y="6" width="44" height="52" rx="6" fill="#fff" stroke={INK} strokeWidth={2.4} />
      <path d="M10 18h44" stroke={INK} strokeWidth={2} />
      <circle cx="18" cy="12" r="2" fill="#ff5a6e" />
      <circle cx="25" cy="12" r="2" fill="#3fbcff" />
      <circle cx="32" cy="38" r="14" fill="#d9f2ff" stroke={INK} strokeWidth={2.4} />
      <path d="M19 40q6-5 13 0t13 0v6a14 14 0 0 1-26 0z" fill="#3fbcff" />
      <circle cx="32" cy="38" r="14" fill="none" stroke={INK} strokeWidth={2.4} />
    </>
  ),
  coin: (
    <>
      <circle cx="32" cy="34" r="22" fill="#e0a312" stroke={INK} strokeWidth={2.4} />
      <circle cx="32" cy="31" r="22" fill="#ffd23a" stroke={INK} strokeWidth={2.4} />
      <circle cx="32" cy="31" r="15" fill="none" stroke="#e0a312" strokeWidth={2.2} />
      <path d="M28 25l5-4v20" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  glove: (
    <>
      <path d="M18 58V30l-4-12a3 3 0 0 1 6-2l4 9V10a3 3 0 0 1 6 0v14V7a3 3 0 0 1 6 0v17V9a3 3 0 0 1 6 0v17-11a3 3 0 0 1 6 0v23c0 10-4 14-6 20z" fill="#fff" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
      <rect x="17" y="48" width="27" height="10" rx="2" fill="#ff7aa8" stroke={INK} strokeWidth={2} />
      <path d="M47 16q4 4 0 8q-4-4 0-8zM12 34q3 3 0 6q-3-3 0-6z" fill="#7ac8ff" stroke={INK} strokeWidth={1.3} />
    </>
  ),
  tap: (
    <>
      <circle cx="32" cy="32" r="22" fill="none" stroke="#ff6fa8" strokeWidth={9} />
      <circle cx="32" cy="32" r="26.5" fill="none" stroke={INK} strokeWidth={2} />
      <circle cx="32" cy="32" r="17.5" fill="none" stroke={INK} strokeWidth={2} />
      <path d="M27 34q-2-6 2-6M37 34q2-6-2-6" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <path d="M28 39q4-3 8 0" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
    </>
  ),
  cookie: (
    <>
      <path d="M32 8a24 24 0 1 0 24 26 7 7 0 0 1-8-8 7 7 0 0 1-8-10 6 6 0 0 1-8-8z" fill="#e8a65a" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      <circle cx="22" cy="26" r="3" fill="#6b3f22" />
      <circle cx="30" cy="40" r="3.4" fill="#6b3f22" />
      <circle cx="42" cy="44" r="2.6" fill="#6b3f22" />
      <circle cx="19" cy="42" r="2.2" fill="#6b3f22" />
      <path d="M44 12l6 6M50 12l-6 6" stroke="#ff5a6e" strokeWidth={2.6} strokeLinecap="round" />
    </>
  ),
};

/** A collectible icon tile. Locked ones turn into a grey silhouette so only the shape gives them away. */
export function NetCollectionIcon({ art, locked }: { art: NetIconArt; locked?: boolean }) {
  return (
    <span className={cn(styles.iconTile, art === "default" && styles.iconTileDefault, locked && styles.silhouette)}>
      <Svg>{ICON_PARTS[art]}</Svg>
    </span>
  );
}

export const NET_FRAME_STYLES = {
  default: "radial-gradient(#ffffff59 2px, transparent 2.5px) 0 0 / 12px 12px, #7ccdfc",
  rainbow: "linear-gradient(115deg, #ff8a8a 0 18%, #ffd36b 18% 36%, #8ae68a 36% 54%, #7ac8ff 54% 72%, #c49bff 72% 90%, #ff8ad8 90%)",
  php: "radial-gradient(#a8b0d8 5px, transparent 5.5px) 0 0 / 22px 22px, #6a76aa",
  maintenance: "repeating-linear-gradient(45deg, #ffd23a 0 18px, #2a2a2a 18px 36px)",
  bluescreen: "#1a4fc0",
  sunset: "linear-gradient(#ff9a5a 0 34%, #ff6f8f 34% 67%, #7a5ab8 67%)",
  washer: "radial-gradient(circle at 50% 120%, #3fbcff 0 45%, #d9f2ff 45% 58%, #fff 58%)",
  login: "repeating-linear-gradient(90deg, #f4f6f9 0 22px, #e5e9ef 22px 44px)",
} as const;
export type NetFrameStyle = keyof typeof NET_FRAME_STYLES;

/** A frame preview: a flat fill or pattern. `motif` is the big outlined word across it. */
export function NetCollectionFrame({ frame, motif, locked }: { frame: NetFrameStyle; motif?: string; locked?: boolean }) {
  return (
    <div className={cn(styles.frame, locked && styles.dim)} style={{ background: NET_FRAME_STYLES[frame] } as CSSProperties}>
      {motif && <span className={cn(styles.frameMotif, frame === "maintenance" && styles.frameMotifDark)}>{motif}</span>}
    </div>
  );
}

export type NetTitleRarity = (typeof NET_TITLE_TYPES)[number];

/** DX NET's title plate, colored by rarity. */
export function NetTitlePlate({ rarity, children, locked }: { rarity: NetTitleRarity; children: ReactNode; locked?: boolean }) {
  return (
    <div className={cn(styles.titlePlate, locked && styles.dim)} data-rarity={rarity}>
      <span>{children}</span>
    </div>
  );
}
