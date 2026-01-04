export const LANGUAGE_ENUM = ["en", "en-GB", "ja", "zh-TW", "zh-HK", "zh-CN", "ko"] as const;

export const REGION_ENUM = ["intl", "jp", "cn"] as const;

export const DIFFICULTY_ENUM = ["basic", "advanced", "expert", "master", "remaster", "utage"] as const;

export const LEVEL_ENUM = [
  "1", "1+", "2", "2+", "3", "3+", "4", "4+", "5", "5+", "6", "6+",
  "7", "7+", "8", "8+", "9", "9+", "10", "10+", "11", "11+", "12", "12+",
  "13", "13+", "14", "14+", "15", "15+", "16", "16+"
] as const;

export const CHART_TYPE_ENUM = ["std", "dx"] as const;

export const FC_ENUM = ["none", "fc", "fc+", "ap", "ap+"] as const;

export const FS_ENUM = ["none", "sync", "fs", "fs+", "fdx", "fdx+"] as const;

export const FETCH_STATUS_ENUM = ["pending", "completed", "failed"] as const;

export const EVENT_TYPE_ENUM = ["area", "eventArea"] as const;

export const EVENT_STATE_ENUM = ["not_started", "in_progress", "completed"] as const;

export const STORE_STATUS_ENUM = ["closed", "open", "temporarily_closed"] as const;

export const DB_TYPES = ["songs", "stats"] as const;
