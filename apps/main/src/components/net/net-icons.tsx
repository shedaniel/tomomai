import type { NetSectionId } from "@/lib/net/routes";

const INK = "#4b3a2f";
const line = { stroke: INK, strokeWidth: 2.5, strokeLinejoin: "round", strokeLinecap: "round" } as const;

function HomeIcon() {
  return (
    <>
      <path d="M4 38c0-5 4-8 8-7 1-5 8-6 11-2 4-1 7 2 6 6 2 0 3 2 3 3z" fill="#fff" />
      <rect x="22" y="12" width="5" height="9" fill="#d9d2c8" {...line} />
      <path d="M20 24h28v18H20z" fill="#fff" {...line} />
      <path d="M15 26 34 8l19 18" fill="#c8553d" {...line} />
      <path d="M18 24 34 10l16 14" fill="none" stroke="#e8836b" strokeWidth={2} />
      <path d="M30 42v-9a4 4 0 0 1 8 0v9" fill="#9b5a2e" {...line} />
    </>
  );
}

function PlayDataIcon() {
  return (
    <>
      <rect x="18" y="4" width="28" height="40" rx="4" fill="#fff" {...line} />
      <rect x="21" y="7" width="22" height="34" rx="2" fill="#3d8ef0" />
      {[11, 15, 19].map(y => [25, 29, 33, 37, 41].map(x => <circle key={`${x}-${y}`} cx={x - 2} cy={y} r={1} fill="#cfe6ff" />))}
      <circle cx="27" cy="27" r="3.5" fill="#fff" />
      <path d="M21 41v-5a6 6 0 0 1 12 0v5z" fill="#fff" />
    </>
  );
}

function FriendsIcon() {
  return (
    <>
      <g transform="rotate(-10 18 24)">
        <rect x="6" y="10" width="18" height="24" rx="3" fill="#fff" {...line} />
        <path d="M10 18h3M17 18h3M12 23q3 2 6 0" fill="none" {...line} strokeWidth={1.8} />
        <circle cx="15" cy="29" r="3" fill="#3d8ef0" />
      </g>
      <g transform="rotate(8 34 24)">
        <rect x="25" y="10" width="18" height="24" rx="3" fill="#fff" {...line} />
        <path d="M29 18h3M36 18h3M31 23q3 2 6 0" fill="none" {...line} strokeWidth={1.8} />
        <circle cx="34" cy="29" r="3" fill="#ff4f6f" />
      </g>
      <path d="M44 22l3-10 4 7 4-9 4 9 3-6v13z" fill="#ffd23a" {...line} />
    </>
  );
}

function ShopIcon() {
  return (
    <>
      <circle cx="30" cy="12" r="5" fill="#ffd23a" {...line} />
      <circle cx="38" cy="10" r="5" fill="#ffd23a" {...line} />
      <path d="M8 8h6l5 26h28" fill="none" {...line} strokeWidth={3} />
      <path d="M15 14h38l-5 16H18z" fill="#d6dbe2" {...line} />
      <path d="M24 14v16M32 14v16M40 14v16M16 22h35" stroke="#8a929e" strokeWidth={2} />
      <circle cx="22" cy="40" r="3.5" fill="#fff" {...line} />
      <circle cx="42" cy="40" r="3.5" fill="#fff" {...line} />
    </>
  );
}

function RecordsIcon() {
  return (
    <>
      <circle cx="24" cy="24" r="18" fill="#ffd23a" {...line} />
      <circle cx="24" cy="24" r="11" fill="none" stroke="#ffe98a" strokeWidth={4} />
      <circle cx="24" cy="24" r="5" fill="#fff" {...line} />
      <path d="M44 34V12l14-4v20" fill="none" {...line} strokeWidth={3.5} />
      <path d="M44 34V12l14-4v20" fill="none" stroke="#5fd35f" strokeWidth={1.5} />
      <ellipse cx="40" cy="35" rx="5" ry="4" fill="#5fd35f" {...line} />
      <ellipse cx="54" cy="29" rx="5" ry="4" fill="#5fd35f" {...line} />
    </>
  );
}

function EventIcon() {
  return (
    <>
      <path d="M8 42c4-6 40-6 48 0z" fill="#ffe08a" {...line} />
      <path d="M24 40c0-10 2-18 6-24" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
      <path d="M24 40c0-10 2-18 6-24" fill="none" stroke="#b07a3a" strokeWidth={3} strokeLinecap="round" />
      <path d="M30 16c-6-6-14-4-18 2 6-2 12-1 18-2zM30 16c2-8 10-10 16-6-6 0-11 3-16 6zM30 16c6-3 14 0 16 7-6-4-11-5-16-7zM30 16c-3 5-10 7-15 6 4-4 9-6 15-6z" fill="#3fbf4f" {...line} strokeWidth={2} />
      <path d="M44 40c0-6 1-11 3-14" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <path d="M44 40c0-6 1-11 3-14" fill="none" stroke="#b07a3a" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M47 26c-4-4-9-3-12 1 4-1 8-1 12-1zM47 26c2-5 7-6 11-3-4 0-7 2-11 3zM47 26c4-1 9 1 10 5-4-3-7-4-10-5z" fill="#3fbf4f" {...line} strokeWidth={2} />
      <circle cx="29" cy="19" r="2.2" fill="#ffd23a" {...line} strokeWidth={1.5} />
      <circle cx="33" cy="20" r="2.2" fill="#ffd23a" {...line} strokeWidth={1.5} />
    </>
  );
}

function CollectionIcon() {
  // Rounded so server and client print the same attribute values.
  const scallops = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return `${(32 + Math.cos(a) * 17).toFixed(2)},${(20 + Math.sin(a) * 17).toFixed(2)}`;
  });
  return (
    <>
      <path d="M24 32l-4 14 7-4 4 6 3-14zM40 32l4 14-7-4-4 6-3-14z" fill="#3d8ef0" {...line} strokeWidth={2} />
      <g>
        {scallops.map((point, i) => {
          const [x, y] = point.split(",").map(Number);
          return <circle key={i} cx={x} cy={y} r={4} fill="#ff9a1a" stroke={INK} strokeWidth={2} />;
        })}
        <circle cx="32" cy="20" r="17" fill="#ff9a1a" />
      </g>
      <circle cx="32" cy="20" r="12" fill="#ffd23a" {...line} />
    </>
  );
}

function RankingIcon() {
  return (
    <>
      <path d="M18 8c-10 0-10 14 2 14M46 8c10 0 10 14-2 14" fill="none" {...line} strokeWidth={5} />
      <path d="M18 8c-10 0-10 14 2 14M46 8c10 0 10 14-2 14" fill="none" stroke="#ffd23a" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M17 5h30c0 14-6 22-15 22S17 19 17 5z" fill="#ffd23a" {...line} />
      <path d="M28 26h8l2 8H26z" fill="#e8a71a" {...line} />
      <rect x="20" y="34" width="24" height="8" rx="2" fill="#c97a1a" {...line} />
    </>
  );
}

/** Tile fills. The home tile carries DX NET's star speckles on its right half. */
export const NET_TILE_BACKGROUNDS: Readonly<Record<NetSectionId, string>> = {
  home: "linear-gradient(90deg,#ff6f62 46%,transparent 46%),radial-gradient(circle,#ffb3aa 0 2.5px,transparent 3px) 0 0/11px 11px,#ff7a6e",
  playData: "#ffb23a",
  friends: "linear-gradient(120deg,#ffe23a 50%,#ff4fa8 50%)",
  shop: "#5fe0be",
  records: "#9be03a",
  event: "linear-gradient(120deg,#ff6f62 33%,#ffb23a 33% 66%,#3fb0ff 66%)",
  collection: "#3fbcff",
  ranking: "#b56cf7",
};

const ICONS: Readonly<Record<NetSectionId, () => React.JSX.Element>> = {
  home: HomeIcon,
  playData: PlayDataIcon,
  friends: FriendsIcon,
  shop: ShopIcon,
  records: RecordsIcon,
  event: EventIcon,
  collection: CollectionIcon,
  ranking: RankingIcon,
};

/** Filled, outlined cartoon art for the menu tiles, in the spirit of DX NET's illustrated buttons. */
export function NetTileIcon({ section, className }: { section: NetSectionId; className?: string }) {
  const Icon = ICONS[section];
  return (
    <svg viewBox="0 0 64 48" className={className} aria-hidden>
      <Icon />
    </svg>
  );
}
