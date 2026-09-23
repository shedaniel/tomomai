import {
  CHART_TYPE_ENUM,
  DIFFICULTY_ENUM,
  FC_ENUM,
  FS_ENUM,
  TITLE_TYPE_ENUM,
} from "../db/types";
import type { Difficulty, FullCombo, FullSync, SongType, TitleType } from "../types";

function codeFor<T extends string>(values: readonly T[], value: T, name: string): number {
  const code = values.indexOf(value);
  if (code < 0) {
    throw new Error(`Unknown maimai ${name}: ${value}`);
  }
  return code;
}

function valueFor<T extends string>(values: readonly T[], code: number, name: string): T {
  const value = values[code];
  if (value === undefined) {
    throw new Error(`Unknown maimai ${name} code: ${code}`);
  }
  return value;
}

export function difficultyToCode(difficulty: Difficulty): number {
  return codeFor(DIFFICULTY_ENUM, difficulty, "difficulty");
}

export function codeToDifficulty(code: number): Difficulty {
  return valueFor(DIFFICULTY_ENUM, code, "difficulty");
}

export function chartTypeToCode(type: SongType): number {
  return codeFor(CHART_TYPE_ENUM, type, "chart type");
}

export function codeToChartType(code: number): SongType {
  return valueFor(CHART_TYPE_ENUM, code, "chart type");
}

export function comboStatusToCode(status: FullCombo): number {
  return codeFor(FC_ENUM, status, "combo status");
}

export function codeToComboStatus(code: number): FullCombo {
  return valueFor(FC_ENUM, code, "combo status");
}

export function syncStatusToCode(status: FullSync): number {
  return codeFor(FS_ENUM, status, "sync status");
}

export function codeToSyncStatus(code: number): FullSync {
  return valueFor(FS_ENUM, code, "sync status");
}

export function titleTypeToCode(titleType: TitleType): number {
  return codeFor(TITLE_TYPE_ENUM, titleType, "title type");
}

export function codeToTitleType(code: number): TitleType {
  return valueFor(TITLE_TYPE_ENUM, code, "title type");
}
