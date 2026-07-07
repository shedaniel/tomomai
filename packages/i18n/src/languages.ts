export const getLanguages = (t: (key: string) => string) => [
  { value: null, label: t('settings.language.auto'), code: "AUTO" },
  { value: "en", label: t('settings.language.en'), code: "US" },
  { value: "en-GB", label: t('settings.language.en-GB'), code: "UK" },
  { value: "ja", label: t('settings.language.ja'), code: "JA" },
  { value: "zh-TW", label: t('settings.language.zh-TW'), code: "TW" },
  { value: "zh-HK", label: t('settings.language.zh-HK'), code: "HK" },
  { value: "zh-CN", label: t('settings.language.zh-CN'), code: "CN" },
  { value: "zh-SG", label: t('settings.language.zh-SG'), code: "SG" },
  { value: "zh-MS", label: t('settings.language.zh-MS'), code: "MS" },
  { value: "ko", label: t('settings.language.ko'), code: "KO" },
] as const;
