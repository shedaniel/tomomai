import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { catalogArtifactSchema, type CatalogArtifact, type CatalogManifest } from "@tomomai/catalog/artifact";

export const MAX_MANIFEST_BYTES = 64 * 1024;
export const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 128 * 1024 * 1024;

export async function readBoundedResponse(response: Response, limit: number): Promise<Buffer> {
  if (!response.ok || Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new Error(!response.ok ? `Catalog download failed: HTTP ${response.status}` : "Catalog download exceeds size limit");
  }
  if (!response.body) throw new Error("Catalog download has no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Catalog download exceeds size limit");
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    await reader.cancel();
  }
}

export function decodeCatalogArtifact(compressed: Buffer, manifest: CatalogManifest, expandedLimit = MAX_EXPANDED_BYTES): CatalogArtifact {
  if (compressed.byteLength > MAX_ARTIFACT_BYTES) throw new Error("Catalog artifact exceeds size limit");
  if (createHash("sha256").update(compressed).digest("hex") !== manifest.sha256) throw new Error("Catalog artifact checksum mismatch");
  const artifact = catalogArtifactSchema.parse(JSON.parse(gunzipSync(compressed, { maxOutputLength: expandedLimit }).toString("utf8")));
  if (artifact.sequence !== manifest.sequence || artifact.schemaVersion !== manifest.schemaVersion || artifact.generatedAt !== manifest.generatedAt) {
    throw new Error("Catalog manifest and artifact metadata differ");
  }
  for (const field of ["parents", "songs", "tourEvents"] as const) {
    if (artifact[field].length !== manifest.counts[field]) throw new Error(`Catalog ${field} count mismatch`);
  }
  return artifact;
}

export function assertCatalogSource(state: { sourceUrl: string } | undefined, sourceUrl: string): void {
  if (state && state.sourceUrl !== sourceUrl) throw new Error("Refusing to switch catalog source");
}

export function shouldApplyCatalog(state: { sequence: number; sha256: string } | undefined, manifest: CatalogManifest, force: boolean): boolean {
  if (!state) return true;
  if (manifest.sequence < state.sequence) throw new Error("Refusing catalog sequence rollback");
  if (manifest.sequence === state.sequence && manifest.sha256 !== state.sha256) throw new Error("Catalog sequence was republished with a different checksum");
  return force || manifest.sequence > state.sequence;
}

type LocalParent = { id: bigint; publicId: string; songName: string; type: string; difficulty: string; disambiguator: number };
type LocalSong = { id: bigint; parentId: bigint; region: string; gameVersion: number };

export function assertCatalogIdentities(artifact: CatalogArtifact, parents: LocalParent[], songs: LocalSong[]): void {
  const parentKey = (row: Omit<LocalParent, "id" | "publicId">) => JSON.stringify([row.songName, row.type, row.difficulty, row.disambiguator]);
  const childKey = (row: { parentId: bigint | string; region: string; gameVersion: number }) => JSON.stringify([String(row.parentId), row.region, row.gameVersion]);
  const parentIds = new Map(parents.map(row => [String(row.id), row]));
  const parentKeys = new Map(parents.map(row => [parentKey(row), String(row.id)]));
  const publicIds = new Map(parents.map(row => [row.publicId, String(row.id)]));
  for (const parent of artifact.parents) {
    const existing = parentIds.get(parent.id);
    if (existing && (existing.publicId !== parent.publicId || existing.type !== parent.type || existing.difficulty !== parent.difficulty)) {
      throw new Error(`Catalog parent identity changed for ID ${parent.id}`);
    }
    for (const id of [parentKeys.get(parentKey(parent)), publicIds.get(parent.publicId)]) {
      if (id !== undefined && id !== parent.id) throw new Error(`Catalog parent identity belongs to another ID: ${parent.id}`);
    }
  }
  const songIds = new Map(songs.map(row => [String(row.id), row]));
  const songKeys = new Map(songs.map(row => [childKey(row), String(row.id)]));
  for (const song of artifact.songs) {
    const existing = songIds.get(song.id);
    if (existing && childKey(existing) !== childKey(song)) throw new Error(`Catalog child identity changed for ID ${song.id}`);
    const id = songKeys.get(childKey(song));
    if (id !== undefined && id !== song.id) throw new Error(`Catalog child identity belongs to another ID: ${song.id}`);
  }
}
