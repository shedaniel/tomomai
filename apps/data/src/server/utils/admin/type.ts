import { VersionId } from "@/lib/metadata";
import { Difficulty, Level, NoteCounts, SongType } from "@/lib/types";

export type Pending<T> = T | { important: boolean; value: T };

export function important<T>(value: T): Pending<T> {
  return { important: true, value };
}

export function value<T>(pending: Pending<T>): T {
  return !pending ? pending : typeof pending === "object" && "important" in pending ? pending.value : pending;
}

export function isImportant<T>(pending: Pending<T>): boolean {
  return !!pending && typeof pending === "object" && "important" in pending && pending.important;
}

export function unwrapUndefined<T>(pending: Pending<NonNullable<T> | undefined>): Pending<NonNullable<T>> | undefined {
  return value(pending) === undefined ? undefined : pending as Pending<NonNullable<T>>;
}

export type PendingSong = {
  songName: string;
  type: SongType;
  difficulty: Difficulty;
  songKana?: Pending<string>;
  artist?: Pending<string>;
  cover?: Pending<string>;
  level: Pending<Level>;
  levelPrecise?: Pending<number>;
  genre?: Pending<string>;
  addedVersion?: Pending<VersionId>;
  bpm?: Pending<number>;
  noteDesigner?: Pending<string>;
  noteCounts?: Pending<NoteCounts>;
  extras?: Record<string, string | number | boolean>;
}
