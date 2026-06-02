import fs from "fs";
import path from "path";

const legalDirectory = path.join(process.cwd(), "content/legal");

export type LegalType = "tos" | "privacy";

export interface LegalDocument {
  type: LegalType;
  version: string; // "YYYYMMDD" (the effective date, taken from the filename)
  content: string;
}

export type ConsentLevel = "ok" | "soft" | "hard";

export interface ConsentStatus {
  docType: LegalType;
  currentVersion: string; // newest published version
  requiredVersion: string; // newest version whose grace window has expired (mandatory floor)
  accepted: string | null; // the user's accepted version
  level: ConsentLevel; // ok | soft (skippable) | hard (blocking)
  deadline: string | null; // ISO date by which the current soft version becomes mandatory
}

// Days a freshly published version stays "soft" (skippable) before it becomes a
// mandatory floor. Editable in the same commit that drops a new txt file.
const DEFAULT_GRACE_DAYS = 30;
// Per-version overrides keyed by "YYYYMMDD". Set 0 for an immediate hard gate.
const GRACE_OVERRIDES: Record<string, number> = {
  // "20260701": 14,
};

const LEGAL_TYPES: LegalType[] = ["tos", "privacy"];

// filename pattern: {type}.{YYYYMMDD}.txt
const FILE_RE = /^(tos|privacy)\.(\d{8})\.txt$/;

interface LegalFile {
  type: LegalType;
  version: string;
  filename: string;
}

function listLegalFiles(): LegalFile[] {
  if (!fs.existsSync(legalDirectory)) return [];
  const files: LegalFile[] = [];
  for (const filename of fs.readdirSync(legalDirectory)) {
    const match = filename.match(FILE_RE);
    if (!match) continue;
    files.push({ type: match[1] as LegalType, version: match[2], filename });
  }
  return files;
}

/** All published versions for a doc type, newest first. */
function versionsFor(type: LegalType): string[] {
  return listLegalFiles()
    .filter((f) => f.type === type)
    .map((f) => f.version)
    .sort((a, b) => (a > b ? -1 : 1)); // YYYYMMDD strings sort chronologically
}

/** The newest published version for each doc type. */
export function getCurrentLegalVersions(): Record<LegalType, string> {
  const result = {} as Record<LegalType, string>;
  for (const type of LEGAL_TYPES) {
    result[type] = versionsFor(type)[0] ?? "";
  }
  return result;
}

/**
 * Load a legal document. Defaults to the newest version; pass a specific
 * "YYYYMMDD" version to load an older revision (e.g. for an audit display).
 */
export function getLegalDocument(type: LegalType, version?: string): LegalDocument | null {
  const resolved = version ?? versionsFor(type)[0];
  if (!resolved) return null;
  const filePath = path.join(legalDirectory, `${type}.${resolved}.txt`);
  if (!fs.existsSync(filePath)) return null;
  return {
    type,
    version: resolved,
    content: fs.readFileSync(filePath, "utf-8"),
  };
}

function graceDaysFor(version: string): number {
  return GRACE_OVERRIDES[version] ?? DEFAULT_GRACE_DAYS;
}

/** Parse a "YYYYMMDD" version into a UTC Date at midnight. */
function effectiveDateOf(version: string): Date {
  const year = Number(version.slice(0, 4));
  const month = Number(version.slice(4, 6));
  const day = Number(version.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}

/** The moment a version stops being soft and becomes the mandatory floor. */
function graceEnd(version: string): Date {
  const end = effectiveDateOf(version);
  end.setUTCDate(end.getUTCDate() + graceDaysFor(version));
  return end;
}

/**
 * The newest version whose grace window has already expired at `now`. This is
 * the mandatory floor: anything below it is a hard block. A version still inside
 * its grace window does not raise the floor.
 */
export function getRequiredVersion(type: LegalType, now: Date): string {
  for (const version of versionsFor(type)) {
    if (graceEnd(version).getTime() <= now.getTime()) return version;
  }
  return ""; // nothing enforced yet (every version still within grace)
}

/**
 * The single gating function. Given the user's accepted version, decide whether
 * they are ok, within a soft grace window, or hard-blocked.
 */
export function getConsentStatus(
  type: LegalType,
  accepted: string | null,
  now: Date,
): ConsentStatus {
  const currentVersion = versionsFor(type)[0] ?? "";
  const requiredVersion = getRequiredVersion(type, now);
  const acc = accepted ?? "";

  let level: ConsentLevel;
  if (acc >= currentVersion) {
    level = "ok";
  } else if (acc >= requiredVersion) {
    level = "soft";
  } else {
    level = "hard";
  }

  const deadline =
    level === "soft" && currentVersion
      ? graceEnd(currentVersion).toISOString().slice(0, 10)
      : null;

  return { docType: type, currentVersion, requiredVersion, accepted, level, deadline };
}
