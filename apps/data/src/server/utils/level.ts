import { VersionId } from "@tomomai/catalog/metadata";

// Helper function to convert level string to precise value (stored as 10x)
export function levelToPrecise(level: string, version: VersionId): number {
  const trimmedLevel = level.trim();

  if (trimmedLevel.endsWith('+')) {
    // Plus level: extract base number and add 6
    const baseLevel = parseInt(trimmedLevel.slice(0, -1), 10);
    if (isNaN(baseLevel)) {
      console.warn(`Invalid plus level format: ${level}`);
      return 10; // Default to 1.0 (10)
    }
    return baseLevel * 10 + (version >= 9 ? 6 : 7);
  } else {
    // Base level: just multiply by 10
    const baseLevel = parseInt(trimmedLevel, 10);
    if (isNaN(baseLevel)) {
      console.warn(`Invalid level format: ${level}`);
      return 10; // Default to 1.0 (10)
    }
    return baseLevel * 10;
  }
}
