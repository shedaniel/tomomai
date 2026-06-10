import { db } from "@/lib/db";
import { parentSong, songs } from "@/lib/db/schema-pg";
import { resolveParents, type ParentState, type SongToParent } from "@tomomai/catalog/resolve-parent";
import { inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

// Temporary write-path shim until ingestion moves to the data service:
// admin upload/import insert songs rows without a parent, and this assigns
// (or creates) the parent_song rows for them afterwards.

/**
 * Assign a parent to every songs row with a NULL parentId.
 * Returns the number of rows parented and parents created.
 */
export async function syncMissingParents(): Promise<{ parented: number; createdParents: number }> {
  const unparented = await db
    .select({
      id: songs.id,
      songName: songs.songName,
      type: songs.type,
      difficulty: songs.difficulty,
      artist: songs.artist,
      genre: songs.genre,
      cover: songs.cover,
      bpm: songs.bpm,
      addedVersion: songs.addedVersion,
      region: songs.region,
      gameVersion: songs.gameVersion,
    })
    .from(songs)
    .where(isNull(songs.parentId));

  if (unparented.length === 0) return { parented: 0, createdParents: 0 };

  // Candidate parents share a songName with an unparented row; their existing
  // children determine addedVersion / region+version occupancy.
  const names = [...new Set(unparented.map(s => s.songName))];
  const candidateRows = await db
    .select()
    .from(parentSong)
    .where(inArray(parentSong.songName, names));
  const childRows = candidateRows.length > 0
    ? await db
      .select({
        parentId: songs.parentId,
        addedVersion: songs.addedVersion,
        region: songs.region,
        gameVersion: songs.gameVersion,
      })
      .from(songs)
      .where(inArray(songs.parentId, candidateRows.map(p => p.id)))
    : [];

  const states = new Map<string, ParentState>();
  for (const row of candidateRows) {
    states.set(row.id.toString(), {
      id: row.id,
      songName: row.songName,
      type: row.type,
      difficulty: row.difficulty,
      disambiguator: row.disambiguator,
      artist: row.artist,
      genre: row.genre,
      cover: row.cover,
      bpm: row.bpm,
      childAddedVersions: new Set(),
      childRegionVersions: new Set(),
    });
  }
  for (const child of childRows) {
    const state = child.parentId !== null ? states.get(child.parentId.toString()) : undefined;
    if (state) {
      state.childAddedVersions.add(child.addedVersion);
      state.childRegionVersions.add(`${child.region}:${child.gameVersion}`);
    }
  }

  const { assignments, newParents } = resolveParents(unparented as SongToParent[], [...states.values()]);

  if (newParents.length > 0) {
    const inserted = await db
      .insert(parentSong)
      .values(newParents.map(parent => ({
        publicId: nanoid(),
        songName: parent.songName,
        artist: parent.artist,
        genre: parent.genre,
        cover: parent.cover,
        bpm: parent.bpm,
        type: parent.type,
        difficulty: parent.difficulty,
        disambiguator: parent.disambiguator,
      })))
      .returning({ id: parentSong.id });
    for (let i = 0; i < newParents.length; i++) {
      newParents[i].id = inserted[i].id;
    }
  }

  // Group assignments by parent for batched updates
  const songIdsByParent = new Map<ParentState, bigint[]>();
  for (const [songId, parent] of assignments) {
    const ids = songIdsByParent.get(parent) ?? [];
    ids.push(songId);
    songIdsByParent.set(parent, ids);
  }
  for (const [parent, songIds] of songIdsByParent) {
    await db.update(songs).set({ parentId: parent.id! }).where(inArray(songs.id, songIds));
  }

  return { parented: unparented.length, createdParents: newParents.length };
}
