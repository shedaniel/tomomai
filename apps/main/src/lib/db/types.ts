export const LANGUAGE_ENUM = ["en", "en-GB", "ja", "zh-TW", "zh-HK", "zh-CN", "zh-SG", "ko"] as const;

export { MAIMAI_DIFFICULTIES as DIFFICULTY_ENUM } from "@tomomai/utils/game-codes";

export const LEVEL_ENUM = [
  "1", "1+", "2", "2+", "3", "3+", "4", "4+", "5", "5+", "6", "6+",
  "7", "7+", "8", "8+", "9", "9+", "10", "10+", "11", "11+", "12", "12+",
  "13", "13+", "14", "14+", "15", "15+", "16", "16+"
] as const;

export { MAIMAI_CHART_TYPES as CHART_TYPE_ENUM } from "@tomomai/utils/game-codes";

export { MAIMAI_COMBO_STATUSES as FC_ENUM } from "@tomomai/utils/game-codes";

export { MAIMAI_SYNC_STATUSES as FS_ENUM } from "@tomomai/utils/game-codes";

export const FETCH_STATUS_ENUM = ["pending", "completed", "failed"] as const;

export const EVENT_TYPE_ENUM = ["area", "eventArea"] as const;

export const EVENT_STATE_ENUM = ["not_started", "in_progress", "completed"] as const;

export const STORE_STATUS_ENUM = ["closed", "open", "temporarily_closed"] as const;

export { MAIMAI_TITLE_TYPES as TITLE_TYPE_ENUM } from "@tomomai/utils/game-codes";

export const DB_TYPES = ["songs", "stats", "events", "posts"] as const;
