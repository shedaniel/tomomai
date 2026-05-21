/**
 * Canonical event step type keys used in the DB.
 * Maps each known Japanese type string to an i18n key under `db.events.stepTypes`.
 */
export const EVENT_STEP_TYPE_KEYS: Record<string, string> = {
  "フレーム": "frame",
  "楽曲": "song",
  "ネームプレート": "nameplate",
  "プレゼント": "present",
  "アイコン": "icon",
  "称号": "title",
  "つあーメンバー": "tourMember",
  "パーフェクトチャレンジ楽曲": "perfectChallenge",
  "KALEIDXSCOPE": "kaleidxscope",
};

export const KNOWN_STEP_TYPES = new Set(Object.keys(EVENT_STEP_TYPE_KEYS));

export const TYPE_ALIASES: Record<string, string> = {
  "課題曲": "楽曲",
  "解禁楽曲": "楽曲",
  "譜面": "楽曲",
  "プレート": "ネームプレート",
  "KALEIDX SCOPE": "KALEIDXSCOPE",
};

/** Normalize a string for comparison (NFKC + strip zero-width chars + trim) */
export function norm(s: string): string {
  return s.normalize("NFKC").replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, "").trim();
}

/** Normalize a step type for comparison */
export function normType(s: string): string {
  const n = norm(s);
  return TYPE_ALIASES[n] ?? n;
}
