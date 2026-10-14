import "server-only";
import type { DivingFishIdentifier } from "@/lib/games/token-format";

const DIVING_FISH_BASE = "https://www.diving-fish.com/api/maimaidxprober";
const DEV_RECORDS_URL = `${DIVING_FISH_BASE}/dev/player/records`;
const PLAYER_RECORDS_URL = `${DIVING_FISH_BASE}/player/records`;

export class DivingFishUserNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DivingFishUserNotFoundError";
  }
}

export class DivingFishPrivacyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DivingFishPrivacyError";
  }
}

export class DivingFishImportTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DivingFishImportTokenError";
  }
}

export class DivingFishAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DivingFishAuthError";
  }
}

export interface DivingFishRecord {
  achievements?: number;
  ds?: number;
  dxScore?: number;
  fc?: string;
  fs?: string;
  level?: string;
  level_index?: number;
  level_label?: string;
  ra?: number;
  rate?: string;
  song_id?: number;
  title?: string;
  type?: string;
}

export interface DivingFishRecordsResponse {
  username?: string;
  nickname?: string;
  rating?: number;
  additional_rating?: number;
  plate?: string;
  records?: DivingFishRecord[];
}

function getDevToken(): string {
  const token = process.env.DIVINGFISH_DEV_TOKEN;
  if (!token) {
    throw new DivingFishAuthError("diving-fish is not configured on the server.");
  }
  return token;
}

async function readBodyText(resp: Response): Promise<string> {
  return (await resp.text().catch(() => "")).slice(0, 500);
}

function parseMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.message === "string") return parsed.message;
  } catch {
    // not json
  }
  return body;
}

export async function fetchDivingFishRecordsByDevToken(
  identifier: DivingFishIdentifier,
  signal?: AbortSignal,
): Promise<DivingFishRecordsResponse> {
  const devToken = getDevToken();
  const params = new URLSearchParams({ [identifier.kind]: identifier.value });
  const url = `${DEV_RECORDS_URL}?${params.toString()}`;

  const resp = await fetch(url, {
    headers: { "Developer-Token": devToken },
    signal,
  });

  if (resp.status === 400) {
    const body = await readBodyText(resp);
    const msg = parseMessage(body);
    if (msg.includes("no such user")) {
      throw new DivingFishUserNotFoundError(`diving-fish user not found: ${msg}`);
    }
    throw new DivingFishAuthError(`diving-fish dev token rejected: ${msg}`);
  }
  if (resp.status === 403) {
    const body = await readBodyText(resp);
    throw new DivingFishPrivacyError(`diving-fish privacy or agreement: ${parseMessage(body)}`);
  }
  if (!resp.ok) {
    const body = await readBodyText(resp);
    throw new Error(`diving-fish records fetch failed: HTTP ${resp.status} ${body}`);
  }

  return (await resp.json()) as DivingFishRecordsResponse;
}

export async function fetchDivingFishRecordsByImportToken(
  importToken: string,
): Promise<DivingFishRecordsResponse> {
  const resp = await fetch(PLAYER_RECORDS_URL, {
    headers: { "Import-Token": importToken },
  });

  if (resp.status === 400) {
    const body = await readBodyText(resp);
    const msg = parseMessage(body);
    if (msg.includes("导入token") || msg.toLowerCase().includes("import")) {
      throw new DivingFishImportTokenError(`Invalid Import-Token: ${msg}`);
    }
    throw new Error(`diving-fish records fetch failed: HTTP 400 ${msg}`);
  }
  if (!resp.ok) {
    const body = await readBodyText(resp);
    throw new Error(`diving-fish records fetch failed: HTTP ${resp.status} ${body}`);
  }

  return (await resp.json()) as DivingFishRecordsResponse;
}
