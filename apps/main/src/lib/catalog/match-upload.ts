import type { Difficulty, SongType } from "@/lib/types";

type Chart = {
  songName: string;
  type: SongType;
  difficulty: Difficulty;
  artist: string;
  addedVersion: number | undefined;
};

export function matchUpload(existing: Chart[], incoming: Chart[]): Map<number, number> {
  const assignments = new Map<number, number>();
  const used = new Set<number>();
  const key = (song: Chart) => JSON.stringify([song.songName, song.type, song.difficulty]);
  const group = (charts: Chart[]) => {
    const groups = new Map<string, number[]>();
    charts.forEach((song, index) => {
      const songKey = key(song);
      const indices = groups.get(songKey) ?? [];
      indices.push(index);
      groups.set(songKey, indices);
    });
    return groups;
  };
  const existingGroups = group(existing);
  const incomingGroups = group(incoming);
  const candidates = (song: Chart) => (existingGroups.get(key(song)) ?? []).filter(index => !used.has(index));
  const assign = (index: number, match: number) => { assignments.set(index, match); used.add(match); };

  // Reserve strong matches first so drifting metadata cannot steal a sibling.
  for (const predicate of [
    (a: Chart, b: Chart) => a.artist === b.artist && a.addedVersion === b.addedVersion,
    (a: Chart, b: Chart) => a.artist === b.artist,
    (a: Chart, b: Chart) => a.addedVersion !== undefined && a.addedVersion === b.addedVersion,
  ]) {
    incoming.forEach((song, index) => {
      if (assignments.has(index)) return;
      const matches = candidates(song).filter(candidate => predicate(song, existing[candidate]));
      if (matches.length === 1) assign(index, matches[0]);
    });
  }
  incoming.forEach((song, index) => {
    if (assignments.has(index)) return;
    const matches = candidates(song);
    const remaining = incomingGroups.get(key(song))!.filter(candidateIndex => !assignments.has(candidateIndex));
    if (matches.length === 1 && remaining.length === 1) assign(index, matches[0]);
  });
  return assignments;
}
