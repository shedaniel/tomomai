// Common timezones
export const TIMEZONES = [
    { value: null, label: "Japan Standard Time", region: "JP" },
    { value: "Asia/Seoul", label: "Korea Standard Time", region: "KR" },
    { value: "Asia/Hong_Kong", label: "Hong Kong Standard Time", region: "HK" },
    { value: "Asia/Shanghai", label: "China Standard Time", region: "CN" },
    { value: "Asia/Taipei", label: "Taiwan Standard Time", region: "TW" },
    { value: "Asia/Singapore", label: "Singapore Standard Time", region: "SG" },
    { value: "Asia/Kuala_Lumpur", label: "Malaysia Standard Time", region: "MY" },
    { value: "Asia/Bangkok", label: "Thailand Standard Time", region: "TH" },
    { value: "Asia/Jakarta", label: "Indonesia Western Time (Jakarta)", region: "ID" },
    { value: "Asia/Makassar", label: "Indonesia Central Time (Makassar)", region: "ID" },
    { value: "Asia/Jayapura", label: "Indonesia Eastern Time (Jayapura)", region: "ID" },
    { value: "Asia/Manila", label: "Philippines Standard Time", region: "PH" },
    { value: "Asia/Ho_Chi_Minh", label: "Vietnam Standard Time", region: "VN" },
    { value: "Asia/Yangon", label: "Myanmar Standard Time", region: "MM" },
    { value: "Australia/Adelaide", label: "Australian Central Time (Adelaide)", region: "AU" },
    { value: "Australia/Eucla", label: "Australian Central Western Time (Eucla)", region: "AU" },
    { value: "Australia/Perth", label: "Australian Western Time (Perth)", region: "AU" },
    { value: "Australia/Sydney", label: "Australian Eastern Time (Sydney)", region: "AU" },
    { value: "Australia/Lord_Howe", label: "Australian Lord Howe Time", region: "AU" },
    { value: "America/New_York", label: "Eastern Standard Time (New York)", region: "US" },
    { value: "America/Chicago", label: "Central Standard Time (Chicago)", region: "US" },
    { value: "America/Denver", label: "Mountain Standard Time (Denver)", region: "US" },
    { value: "America/Los_Angeles", label: "Pacific Standard Time (Los Angeles)", region: "US" },
    { value: "Europe/London", label: "Greenwich Mean Time (London)", region: "EU" },
    { value: "Europe/Paris", label: "Central European Time (Paris)", region: "EU" },
    { value: "Europe/Berlin", label: "Central European Time (Berlin)", region: "EU" },
    { value: "UTC", label: "Coordinated Universal Time (UTC)", region: "UTC" },
  ];

// Enums for database schema
export const TIMEZONE_ENUM = [
  "Asia/Seoul",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Manila",
  "Asia/Ho_Chi_Minh",
  "Asia/Yangon",
  "Australia/Adelaide",
  "Australia/Eucla",
  "Australia/Perth",
  "Australia/Sydney",
  "Australia/Lord_Howe",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "UTC",
] as const;

export const LANGUAGE_ENUM = ["en", "en-GB", "ja", "zh-TW", "zh-HK", "zh-CN", "ko"] as const;

export const REGION_ENUM = ["intl", "jp"] as const;

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
