const INK = "#4b3a2f";

/** 0 smug, 1 annoyed, 2 angry, 3 furious, 4 defeated. */
export type NetAiMood = 0 | 1 | 2 | 3 | 4;

/** tomomai AI: the pink blob from the shop, smug this time, with an antenna and shades. */
export function NetAiMascot({ size = 84, mood = 0 }: { size?: number; mood?: NetAiMood }) {
  const face = mood === 3 ? "#ff9fbf" : "#ffd6e6";
  return (
    <svg viewBox="0 0 84 84" width={size} height={size} aria-hidden>
      <rect width="84" height="84" fill="#dff1ff" />
      <path d="M0 64h84v20H0z" fill="#bfe4ff" />
      <path d="M42 14V5" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <circle cx="42" cy="5" r="3.6" fill="#3fbcff" stroke={INK} strokeWidth={2} />
      <ellipse cx="42" cy="78" rx="22" ry="3" fill="#00000018" />
      <path d="M14 46c0-18 12-31 28-31s28 13 28 31-12 30-28 30S14 64 14 46z" fill={face} stroke={INK} strokeWidth={2.6} />
      <path d="M22 24l-4-10 10 6M62 24l4-10-10 6" fill={face} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
      <path d="M20 40h44l-2 9a6 6 0 0 1-6 5h-6a6 6 0 0 1-6-5l-1-3h-2l-1 3a6 6 0 0 1-6 5h-6a6 6 0 0 1-6-5z" fill="#2b2140" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <path d="M25 43l5 0M47 43l5 0" stroke="#7ad4ff" strokeWidth={2} strokeLinecap="round" />
      {mood === 1 && <path d="M23 34h13M48 34h13" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />}
      {(mood === 2 || mood === 3) && <path d="M23 29l13 6M61 29l-13 6" stroke={INK} strokeWidth={3} strokeLinecap="round" />}
      {mood === 3 && <path d="M8 22l4 4M6 30h5M76 22l-4 4M78 30h-5" stroke="#e04050" strokeWidth={2.4} strokeLinecap="round" />}
      {mood === 4 && <path d="M64 26q3 5 0 8q-3-3 0-8z" fill="#7ac8ff" stroke={INK} strokeWidth={1.4} />}
      <path
        d={mood === 0 || mood === 1 ? "M34 62q8 6 16 0" : mood === 4 ? "M34 65q8-6 16 0" : "M34 63h16"}
        fill="none"
        stroke={INK}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      <ellipse cx="22" cy="58" rx="4.4" ry="2.6" fill="#ff8fb0" opacity={0.75} />
      <ellipse cx="62" cy="58" rx="4.4" ry="2.6" fill="#ff8fb0" opacity={0.75} />
    </svg>
  );
}

/** The grey silhouette DX NET shows when a player has no icon. */
export function NetBlankAvatar({ size = 84 }: { size?: number }) {
  return (
    <svg viewBox="0 0 84 84" width={size} height={size} aria-hidden>
      <rect width="84" height="84" fill="#42a5f5" />
      <circle cx="42" cy="34" r="16" fill="#1e7fe0" />
      <path d="M12 84c0-18 13-30 30-30s30 12 30 30z" fill="#1e7fe0" />
    </svg>
  );
}
