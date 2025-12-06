export interface Theme {
  id: string;
  hue: number;
  contrast: number;
  darkness: number;
  lightness?: number;
  saturation?: number;
  dark: boolean;
  group: string;
}

export const themes: Theme[] = [
  // Simple
  { id: "simple", hue: 0, contrast: 0.0, darkness: 1.0, dark: false, group: "simple" },
  { id: "dark-simple", hue: 0, contrast: 0.0, darkness: 1.0, dark: true, group: "simple" },
  { id: "gray-simple", hue: 0, contrast: 0.0, darkness: 1.0, lightness: 2.5, saturation: 0.7, dark: true, group: "simple" },
  // Brown (hue 90)
  { id: "burnt-brown", hue: 90, contrast: 0.9, darkness: 0.7, dark: false, group: "brown" },
  { id: "light-brown", hue: 90, contrast: 1.3, darkness: 0.4, dark: false, group: "brown" },
  { id: "dark-brown", hue: 90, contrast: 0.9, darkness: -0.1, dark: true, group: "brown" },
  { id: "gray-brown", hue: 90, contrast: 0.9, darkness: -0.1, lightness: 2.5, saturation: 0.7, dark: true, group: "brown" },
  // Amaranth (hue 0)
  { id: "burnt-amaranth", hue: 0, contrast: 0.9, darkness: 0.7, dark: false, group: "amaranth" },
  { id: "light-amaranth", hue: 0, contrast: 1.3, darkness: 0.4, dark: false, group: "amaranth" },
  { id: "dark-amaranth", hue: 0, contrast: 0.9, darkness: -0.4, dark: true, group: "amaranth" },
  { id: "gray-amaranth", hue: 0, contrast: 0.9, darkness: -0.4, lightness: 2.5, saturation: 0.7, dark: true, group: "amaranth" },
  // Rose (hue 20)
  { id: "burnt-rose", hue: 20, contrast: 0.9, darkness: 0.7, dark: false, group: "rose" },
  { id: "light-rose", hue: 20, contrast: 1.3, darkness: 0.4, dark: false, group: "rose" },
  { id: "dark-rose", hue: 20, contrast: 0.9, darkness: 0.7, dark: true, group: "rose" },
  { id: "gray-rose", hue: 20, contrast: 0.9, darkness: 0.7, lightness: 2.5, saturation: 0.7, dark: true, group: "rose" },
  // Grass (hue 140)
  { id: "burnt-grass", hue: 140, contrast: 0.9, darkness: 0.7, dark: false, group: "grass" },
  { id: "light-grass", hue: 140, contrast: 1.3, darkness: 0.4, dark: false, group: "grass" },
  { id: "dark-grass", hue: 140, contrast: 0.9, darkness: 0.7, dark: true, group: "grass" },
  { id: "gray-grass", hue: 140, contrast: 0.9, darkness: 0.7, lightness: 2.5, saturation: 0.7, dark: true, group: "grass" },
  // Emerald (hue 180)
  { id: "burnt-emerald", hue: 180, contrast: 0.9, darkness: 0.7, dark: false, group: "emerald" },
  { id: "light-emerald", hue: 180, contrast: 1.3, darkness: 0.4, dark: false, group: "emerald" },
  { id: "dark-emerald", hue: 180, contrast: 0.9, darkness: 0.7, dark: true, group: "emerald" },
  { id: "gray-emerald", hue: 180, contrast: 0.9, darkness: 0.7, lightness: 2.5, saturation: 0.7, dark: true, group: "emerald" },
  // Blue (hue 240)
  { id: "burnt-blue", hue: 240, contrast: 0.9, darkness: 0.7, dark: false, group: "blue" },
  { id: "light-blue", hue: 240, contrast: 1.3, darkness: 0.4, dark: false, group: "blue" },
  { id: "dark-blue", hue: 240, contrast: 0.9, darkness: 0.7, dark: true, group: "blue" },
  { id: "gray-blue", hue: 240, contrast: 0.9, darkness: 0.7, lightness: 2.5, saturation: 0.7, dark: true, group: "blue" },
  // Purple (hue 300)
  { id: "burnt-purple", hue: 300, contrast: 0.9, darkness: 0.7, dark: false, group: "purple" },
  { id: "light-purple", hue: 300, contrast: 1.3, darkness: 0.4, dark: false, group: "purple" },
  { id: "dark-purple", hue: 300, contrast: 0.9, darkness: 0.7, dark: true, group: "purple" },
  { id: "gray-purple", hue: 300, contrast: 0.9, darkness: 0.7, lightness: 2.5, saturation: 0.7, dark: true, group: "purple" },
  // Gold (hue 60)
  { id: "burnt-gold", hue: 80, contrast: 0.9, darkness: 0.5, dark: false, group: "gold" },
  { id: "light-gold", hue: 80, contrast: 1.3, darkness: 0.2, dark: false, group: "gold" },
  { id: "dark-gold", hue: 80, contrast: 0.9, darkness: 0.7, dark: true, group: "gold" },
  { id: "gray-gold", hue: 80, contrast: 0.9, darkness: 0.7, lightness: 2.5, saturation: 0.7, dark: true, group: "gold" },
  // Pink (hue 330)
  { id: "burnt-pink", hue: 0, contrast: 0.9, darkness: 0.5, dark: false, group: "pink" },
  { id: "light-pink", hue: 0, contrast: 1.3, darkness: 0.1, dark: false, group: "pink" },
  { id: "dark-pink", hue: 0, contrast: 0.9, darkness: 0.7, dark: true, group: "pink" },
  { id: "gray-pink", hue: 0, contrast: 0.9, darkness: 0.7, lightness: 2.5, saturation: 0.7, dark: true, group: "pink" },
];

export const DEFAULT_THEME_ID = "burnt-brown";

export function getThemeById(id: string): Theme | undefined {
  return themes.find((theme) => theme.id === id);
}

export function getThemeOrDefault(id: string | null | undefined): Theme {
  if (!id) return getThemeById(DEFAULT_THEME_ID)!;
  return getThemeById(id) ?? getThemeById(DEFAULT_THEME_ID)!;
}

const THEME_STORAGE_KEY = "tomomai-theme";

export function getSavedThemeId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(THEME_STORAGE_KEY);
}

export function saveThemeId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, id);
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
  const theme = getThemeOrDefault(savedId);
  applyTheme(theme);
}
