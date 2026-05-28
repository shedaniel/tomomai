export interface Theme {
  id: string;
  hue: number;
  contrast: number;
  darkness: number;
  lightness?: number;
  saturation?: number;
  dark: boolean;
  group: string;
  name: string;
}

export const themes: Theme[] = [
  // Simple
  { id: "simple", hue: 0, contrast: 0.0, darkness: 1.0, dark: false, group: "simple", name: "Simple" },
  { id: "dark-simple", hue: 0, contrast: 0.0, darkness: 1.0, dark: true, group: "simple", name: "Dark Simple" },
  { id: "gray-simple", hue: 0, contrast: 0.0, darkness: 1.0, lightness: 2.5, saturation: 0.7, dark: true, group: "simple", name: "Gray Simple" },
  // Brown (hue 90)
  { id: "burnt-brown", hue: 90, contrast: 0.9, darkness: 0.7, dark: false, group: "brown", name: "Burnt Brown" },
  { id: "light-brown", hue: 90, contrast: 1.3, darkness: 0.4, dark: false, group: "brown", name: "Light Brown" },
  { id: "dark-brown", hue: 90, contrast: 0.9, darkness: -0.1, dark: true, group: "brown", name: "Dark Brown" },
  { id: "gray-brown", hue: 90, contrast: 0.9, darkness: -0.1, lightness: 2.5, saturation: 0.7, dark: true, group: "brown", name: "Gray Brown" },
  // Amaranth (hue 0)
  { id: "burnt-amaranth", hue: 0, contrast: 0.9, darkness: 0.7, dark: false, group: "amaranth", name: "Burnt Amaranth" },
  { id: "light-amaranth", hue: 0, contrast: 1.3, darkness: 0.4, dark: false, group: "amaranth", name: "Light Amaranth" },
  { id: "dark-amaranth", hue: 0, contrast: 0.9, darkness: -0.4, dark: true, group: "amaranth", name: "Dark Amaranth" },
  { id: "gray-amaranth", hue: 0, contrast: 0.9, darkness: -0.4, lightness: 2.5, saturation: 0.7, dark: true, group: "amaranth", name: "Gray Amaranth" },
  // Rose (hue 20)
  { id: "burnt-rose", hue: 20, contrast: 0.9, darkness: 0.7, dark: false, group: "rose", name: "Burnt Rose" },
  { id: "light-rose", hue: 20, contrast: 1.3, darkness: 0.4, dark: false, group: "rose", name: "Light Rose" },
  { id: "dark-rose", hue: 20, contrast: 0.9, darkness: 0.7, dark: true, group: "rose", name: "Dark Rose" },
  { id: "gray-rose", hue: 20, contrast: 0.9, darkness: 0.7, lightness: 2.5, saturation: 0.7, dark: true, group: "rose", name: "Gray Rose" },
  // Grass (hue 140)
  { id: "burnt-grass", hue: 140, contrast: 0.9, darkness: 0.7, dark: false, group: "grass", name: "Burnt Grass" },
  { id: "light-grass", hue: 140, contrast: 1.3, darkness: 0.4, dark: false, group: "grass", name: "Light Grass" },
  { id: "dark-grass", hue: 140, contrast: 0.9, darkness: 0.7, dark: true, group: "grass", name: "Dark Grass" },
  { id: "gray-grass", hue: 140, contrast: 0.9, darkness: 0.7, lightness: 2.5, saturation: 0.7, dark: true, group: "grass", name: "Gray Grass" },
  // Emerald (hue 180)
  { id: "burnt-emerald", hue: 180, contrast: 0.9, darkness: 0.7, dark: false, group: "emerald", name: "Burnt Emerald" },
  { id: "light-emerald", hue: 180, contrast: 1.3, darkness: 0.4, dark: false, group: "emerald", name: "Light Emerald" },
  { id: "dark-emerald", hue: 180, contrast: 0.9, darkness: 0.7, dark: true, group: "emerald", name: "Dark Emerald" },
  { id: "gray-emerald", hue: 180, contrast: 0.9, darkness: 0.7, lightness: 2.5, saturation: 0.7, dark: true, group: "emerald", name: "Gray Emerald" },
  // Blue (hue 240)
  { id: "burnt-blue", hue: 240, contrast: 0.9, darkness: 0.7, dark: false, group: "blue", name: "Burnt Blue" },
  { id: "light-blue", hue: 240, contrast: 1.3, darkness: 0.4, dark: false, group: "blue", name: "Light Blue" },
  { id: "dark-blue", hue: 240, contrast: 0.9, darkness: 0.7, dark: true, group: "blue", name: "Dark Blue" },
  { id: "gray-blue", hue: 240, contrast: 0.9, darkness: 0.7, lightness: 2.5, saturation: 0.7, dark: true, group: "blue", name: "Gray Blue" },
  // Purple (hue 300)
  { id: "burnt-purple", hue: 300, contrast: 0.9, darkness: 0.7, dark: false, group: "purple", name: "Burnt Purple" },
  { id: "light-purple", hue: 300, contrast: 1.3, darkness: 0.4, dark: false, group: "purple", name: "Light Purple" },
  { id: "dark-purple", hue: 300, contrast: 0.9, darkness: 0.7, dark: true, group: "purple", name: "Dark Purple" },
  { id: "gray-purple", hue: 300, contrast: 0.9, darkness: 0.7, lightness: 2.5, saturation: 0.7, dark: true, group: "purple", name: "Gray Purple" },
  // Gold (hue 60)
  { id: "burnt-gold", hue: 80, contrast: 0.9, darkness: 0.5, dark: false, group: "gold", name: "Burnt Gold" },
  { id: "light-gold", hue: 80, contrast: 1.3, darkness: 0.2, dark: false, group: "gold", name: "Light Gold" },
  { id: "dark-gold", hue: 80, contrast: 0.9, darkness: 0.7, dark: true, group: "gold", name: "Dark Gold" },
  { id: "gray-gold", hue: 80, contrast: 0.9, darkness: 0.7, lightness: 2.5, saturation: 0.7, dark: true, group: "gold", name: "Gray Gold" },
  // Pink (hue 330)
  { id: "burnt-pink", hue: 0, contrast: 0.9, darkness: 0.5, dark: false, group: "pink", name: "Burnt Pink" },
  { id: "light-pink", hue: 0, contrast: 1.3, darkness: 0.1, dark: false, group: "pink", name: "Light Pink" },
  { id: "dark-pink", hue: 0, contrast: 0.9, darkness: 0.7, dark: true, group: "pink", name: "Dark Pink" },
  { id: "gray-pink", hue: 0, contrast: 0.9, darkness: 0.7, lightness: 2.5, saturation: 0.7, dark: true, group: "pink", name: "Gray Pink" },
];

export const DEFAULT_THEME_ID = "gray-pink";
export const THEME_STORAGE_KEY = "tomomai-theme";
export const CUSTOM_THEME_PREFIX = "custom:";

export function isCustomThemeId(id: string): boolean {
  return id.startsWith(CUSTOM_THEME_PREFIX);
}

export function parseCustomThemeId(id: string): Theme | null {
  if (!isCustomThemeId(id)) return null;
  const parts = id.slice(CUSTOM_THEME_PREFIX.length).split(":");
  if (parts.length < 4) return null;
  const hue = parseFloat(parts[0]);
  const contrast = parseFloat(parts[1]);
  const darkness = parseFloat(parts[2]);
  const dark = parts[3] === "1";
  const lightness = parts[4] !== undefined ? parseFloat(parts[4]) : undefined;
  if (isNaN(hue) || isNaN(contrast) || isNaN(darkness)) return null;
  return { id, hue, contrast, darkness, lightness, dark, group: "custom", name: "Custom" };
}

export function buildCustomThemeId(theme: Pick<Theme, "hue" | "contrast" | "darkness" | "dark" | "lightness">): string {
  const parts = [
    String(Math.round(theme.hue)),
    theme.contrast.toFixed(2),
    theme.darkness.toFixed(2),
    theme.dark ? "1" : "0",
  ];
  if (theme.lightness !== undefined) parts.push(theme.lightness.toFixed(2));
  return CUSTOM_THEME_PREFIX + parts.join(":");
}

export function getThemeById(id: string): Theme | undefined {
  if (isCustomThemeId(id)) return parseCustomThemeId(id) ?? undefined;
  return themes.find((theme) => theme.id === id);
}

export function getThemeOrDefault(id: string | null | undefined): Theme {
  if (!id) return themes.find((t) => t.id === DEFAULT_THEME_ID)!;
  return getThemeById(id) ?? themes.find((t) => t.id === DEFAULT_THEME_ID)!;
}

export function getSavedThemeId(): string | null {
  if (typeof window === "undefined") return null;
  // Try cookie first
  const match = document.cookie.match(new RegExp(`(^| )${THEME_STORAGE_KEY}=([^;]+)`));
  if (match) return match[2];
  return localStorage.getItem(THEME_STORAGE_KEY);
}

export function saveThemeId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, id);
  document.cookie = `${THEME_STORAGE_KEY}=${id}; path=/; max-age=31536000`;
}

export function getThemeStyleProperties(theme: Theme): React.CSSProperties {
  return {
    "--hue": String(theme.hue),
    "--contrast": String(theme.contrast),
    "--darkness": String(theme.darkness),
    "--lightness": String(theme.lightness ?? 1.0),
    "--saturation": String(theme.saturation ?? 1.0),
  } as React.CSSProperties;
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--hue", String(theme.hue));
  document.documentElement.style.setProperty("--contrast", String(theme.contrast));
  document.documentElement.style.setProperty("--darkness", String(theme.darkness));
  document.documentElement.style.setProperty("--lightness", String(theme.lightness ?? 1.0));
  document.documentElement.style.setProperty("--saturation", String(theme.saturation ?? 1.0));

  // Toggle dark class
  if (theme.dark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

export function initializeTheme(): void {
  const savedId = getSavedThemeId();
  if (savedId) {
    saveThemeId(savedId);
  }
  const theme = getThemeOrDefault(savedId);
  applyTheme(theme);
}
