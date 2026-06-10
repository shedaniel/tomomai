// Catalog enums live in @tomomai/catalog (shared with the data service)
export { REGION_ENUM, DIFFICULTY_ENUM, LEVEL_ENUM, CHART_TYPE_ENUM } from "@tomomai/catalog/enums";

export const LANGUAGE_ENUM = ["en", "en-GB", "ja", "zh-TW", "zh-HK", "zh-CN", "zh-SG", "ko"] as const;

export const FC_ENUM = ["none", "fc", "fc+", "ap", "ap+"] as const;

export const FS_ENUM = ["none", "sync", "fs", "fs+", "fdx", "fdx+"] as const;

export const FETCH_STATUS_ENUM = ["pending", "completed", "failed"] as const;

export const EVENT_TYPE_ENUM = ["area", "eventArea"] as const;

export const EVENT_STATE_ENUM = ["not_started", "in_progress", "completed"] as const;

export const STORE_STATUS_ENUM = ["closed", "open", "temporarily_closed"] as const;

export const TITLE_TYPE_ENUM = ["normal", "bronze", "silver", "gold", "rainbow"] as const;

export const DB_TYPES = ["songs", "stats", "events", "posts"] as const;
