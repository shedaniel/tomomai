import type { ReactNode } from "react";

const INK = "#4b3a2f";
const POP = { fontFamily: "var(--net-font-pop), sans-serif", fontWeight: 700 } as const;

export type NetSpecialFriend = "sega" | "miku" | "pi" | "washer" | "future" | "mirror" | "self" | "error" | "jackpot" | "nobody";

function Frame({ size, bg, children }: { size: number; bg: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 84 84" width={size} height={size} aria-hidden>
      <rect width="84" height="84" fill={bg} />
      {children}
    </svg>
  );
}

const SILHOUETTE = "M12 84c0-18 13-30 30-30s30 12 30 30z";

/** Icon art for the secret friends behind special friend codes. */
export function NetSpecialAvatar({ kind, size = 84 }: { kind: NetSpecialFriend; size?: number }) {
  switch (kind) {
    case "sega":
      return (
        <Frame size={size} bg="#1e5bd8">
          <path d="M26 30l4-14 7 8 5-11 5 11 7-8 4 14z" fill="#ffd23a" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
          <text x="42" y="60" textAnchor="middle" fontSize="24" fill="#fff" stroke="#0b2f7a" strokeWidth={5} paintOrder="stroke" style={POP}>SEGA</text>
        </Frame>
      );
    case "miku":
      return (
        <Frame size={size} bg="#e8fbf8">
          <rect x="5" y="28" width="14" height="54" rx="7" fill="#39c5bb" stroke={INK} strokeWidth={2.4} />
          <rect x="65" y="28" width="14" height="54" rx="7" fill="#39c5bb" stroke={INK} strokeWidth={2.4} />
          <rect x="14" y="26" width="8" height="6" rx="1.5" fill="#e0457b" stroke={INK} strokeWidth={1.6} />
          <rect x="62" y="26" width="8" height="6" rx="1.5" fill="#e0457b" stroke={INK} strokeWidth={1.6} />
          <circle cx="42" cy="46" r="22" fill="#ffe9d9" stroke={INK} strokeWidth={2.6} />
          <path d="M20 44c0-14 10-22 22-22s22 8 22 22c-6-6-10-8-14-8l-4 6-4-8c-6 0-14 4-22 10z" fill="#39c5bb" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
          <ellipse cx="34" cy="51" rx="3" ry="4" fill="#1f7f78" />
          <ellipse cx="50" cy="51" rx="3" ry="4" fill="#1f7f78" />
          <path d="M37 60q5 4 10 0" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
        </Frame>
      );
    case "pi":
      return (
        <Frame size={size} bg="#fff4c2">
          <text x="40" y="62" textAnchor="middle" fontSize="58" fill="#3d7bff" stroke={INK} strokeWidth={4} paintOrder="stroke" style={POP}>π</text>
          <text x="70" y="74" textAnchor="middle" fontSize="16" fill={INK} style={POP}>...</text>
        </Frame>
      );
    case "washer":
      return (
        <Frame size={size} bg="#dff1ff">
          <rect x="12" y="8" width="60" height="70" rx="6" fill="#fff" stroke={INK} strokeWidth={2.6} />
          <path d="M12 22h60" stroke={INK} strokeWidth={2.4} />
          <circle cx="22" cy="15" r="3" fill="#ff4fa8" stroke={INK} strokeWidth={1.4} />
          <circle cx="32" cy="15" r="3" fill="#ffd23a" stroke={INK} strokeWidth={1.4} />
          <rect x="48" y="12" width="18" height="6" rx="1.5" fill="#bfe4ff" stroke={INK} strokeWidth={1.4} />
          <circle cx="42" cy="50" r="21" fill="#e9e9e9" stroke={INK} strokeWidth={2.6} />
          <circle cx="42" cy="50" r="15" fill="#3fbcff" stroke={INK} strokeWidth={2} />
          <path d="M30 54q6-6 12 0t12 0" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
        </Frame>
      );
    case "future":
      return (
        <Frame size={size} bg="#e9dcff">
          <circle cx="42" cy="34" r="16" fill="#8a5fd8" />
          <path d={SILHOUETTE} fill="#8a5fd8" />
          <circle cx="66" cy="18" r="12" fill="#fff" stroke={INK} strokeWidth={2.4} />
          <path d="M66 11v7l5 3" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
        </Frame>
      );
    case "mirror":
      return (
        <Frame size={size} bg="#42a5f5">
          <circle cx="42" cy="34" r="16" fill="#1e7fe0" />
          <path d={SILHOUETTE} fill="#1e7fe0" />
          <rect x="42" width="42" height="84" fill="#ffffff66" />
          <path d="M42 0v84" stroke={INK} strokeWidth={2} strokeDasharray="5 4" />
        </Frame>
      );
    case "self":
      return (
        <Frame size={size} bg="#ffe4f1">
          <circle cx="42" cy="34" r="16" fill="#e0457b" />
          <path d={SILHOUETTE} fill="#e0457b" />
          <path d="M30 14l6 8 6-10 6 10 6-8-2 12H32z" fill="#ffd23a" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <path d="M70 52l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
        </Frame>
      );
    case "error":
      return (
        <Frame size={size} bg="#fff0f2">
          <path d="M42 10l32 52H10z" fill="#ffd23a" stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
          <text x="42" y="54" textAnchor="middle" fontSize="30" fill={INK} style={POP}>!</text>
          <text x="42" y="78" textAnchor="middle" fontSize="13" fill="#e04050" style={POP}>100001</text>
        </Frame>
      );
    case "jackpot":
      return (
        <Frame size={size} bg="#ffe25a">
          {[8, 31, 54].map(x => (
            <g key={x}>
              <rect x={x} y="24" width="22" height="36" rx="4" fill="#fff" stroke={INK} strokeWidth={2.4} />
              <text x={x + 11} y="52" textAnchor="middle" fontSize="26" fill="#e04050" stroke={INK} strokeWidth={1.5} paintOrder="stroke" style={POP}>7</text>
            </g>
          ))}
        </Frame>
      );
    case "nobody":
      return (
        <Frame size={size} bg="#f4f4f4">
          <circle cx="42" cy="34" r="16" fill="none" stroke="#b5b5b5" strokeWidth={2.4} strokeDasharray="5 4" />
          <path d={SILHOUETTE} fill="none" stroke="#b5b5b5" strokeWidth={2.4} strokeDasharray="5 4" />
        </Frame>
      );
  }
}

/** A first-year idol: hair ribbons and a music note, drawn from scratch. */
export function NetKotoneAvatar({ size = 84 }: { size?: number }) {
  return (
    <Frame size={size} bg="#ffe9c9">
      <circle cx="42" cy="34" r="16" fill="#f0a35b" />
      <path d={SILHOUETTE} fill="#f0a35b" />
      <circle cx="26" cy="22" r="5" fill="#ff6f62" stroke={INK} strokeWidth={1.8} />
      <circle cx="58" cy="22" r="5" fill="#ff6f62" stroke={INK} strokeWidth={1.8} />
      <path d="M62 56V42l10-3v12" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="60" cy="57" rx="3.4" ry="2.6" fill="#fff" stroke={INK} strokeWidth={1.8} />
      <ellipse cx="70" cy="52" rx="3.4" ry="2.6" fill="#fff" stroke={INK} strokeWidth={1.8} />
    </Frame>
  );
}
