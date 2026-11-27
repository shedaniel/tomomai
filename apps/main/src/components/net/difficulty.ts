export const NET_DIFFICULTIES = ["basic", "advanced", "expert", "master", "remaster", "utage"] as const;
export type NetDifficulty = (typeof NET_DIFFICULTIES)[number];

/** Card fill, header strip and outline colors for each difficulty, sampled from DX NET. */
export const NET_DIFFICULTY_COLORS: Readonly<Record<NetDifficulty, { fill: string; strip: string; ink: string; pill: string }>> = {
  basic: { fill: "#8fe08f", strip: "#45c645", ink: "#2a8a2a", pill: "#5cd65c" },
  advanced: { fill: "#ffd27a", strip: "#ffad1f", ink: "#c27a00", pill: "#ffb21f" },
  expert: { fill: "#ff9a9a", strip: "#f0606e", ink: "#e04050", pill: "#ff6f7f" },
  master: { fill: "#c58af2", strip: "#a54ef0", ink: "#9b3fe0", pill: "#a54ef0" },
  remaster: { fill: "#eadcf7", strip: "#c08ef0", ink: "#b14ce6", pill: "#f3e9fb" },
  utage: { fill: "#ff9de8", strip: "#ff4fd8", ink: "#c21fa0", pill: "#ff4fd8" },
};

export function netDifficulty(code: number): NetDifficulty {
  return NET_DIFFICULTIES[code] ?? "master";
}
