/**
 * Map of `songs.addedVersion` id → display short name.
 *
 * Duplicated from `apps/main/src/lib/metadata.ts`. Worth extracting into a
 * shared `@tomomai/maimai-meta` package eventually, but a tiny duplicate
 * beats the workspace plumbing for now. Keep in sync.
 */
const VERSION_NAME_BY_ID: Record<number, string> = {
  [-13]: "maimai",
  [-12]: "maimai PLUS",
  [-11]: "GreeN",
  [-10]: "GreeN PLUS",
  [-9]: "ORANGE",
  [-8]: "ORANGE PLUS",
  [-7]: "PiNK",
  [-6]: "PiNK PLUS",
  [-5]: "MURASAKi",
  [-4]: "MURASAKi PLUS",
  [-3]: "MiLK",
  [-2]: "MiLK PLUS",
  [-1]: "FiNALE",
  0: "DX",
  1: "DX PLUS",
  2: "Splash",
  3: "Splash PLUS",
  4: "UNiVERSE",
  5: "UNiVERSE PLUS",
  6: "FESTiVAL",
  7: "FESTiVAL PLUS",
  8: "BUDDiES",
  9: "BUDDiES PLUS",
  10: "PRiSM",
  11: "PRiSM PLUS",
  12: "CiRCLE",
  13: "CiRCLE PLUS",
};

export function getVersionName(addedVersion: number): string {
  return VERSION_NAME_BY_ID[addedVersion] ?? `v${addedVersion}`;
}
