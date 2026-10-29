export const REGIONS = ["intl", "jp", "cn"] as const;
export type Region = (typeof REGIONS)[number];

export type TakeoutExport = {
  schemaVersion: 1;
  exportedAt: string;
  source: {
    app: "tomomai-takeout";
    apiBase: string;
  };
  account: {
    me: unknown;
    settings: unknown;
    scopes: string[];
  };
  regions: Record<Region, RegionExport>;
};

export type RegionExport = {
  snapshots: unknown[];
  recents: unknown[];
  stats: unknown | null;
  albums: unknown[];
  errors: Array<{ endpoint: string; status: number; error: string }>;
};

export class ApiError extends Error {
  constructor(
    readonly endpoint: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type SnapshotMetadata = { id: string };

function emptyRegionExport(): RegionExport {
  return { snapshots: [], recents: [], stats: null, albums: [], errors: [] };
}

function isRegion(value: string): value is Region {
  return REGIONS.includes(value as Region);
}

export function isApiAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function errorRecord(error: unknown, fallbackEndpoint: string): { endpoint: string; status: number; error: string } {
  if (error instanceof ApiError) {
    return { endpoint: error.endpoint, status: error.status, error: error.message };
  }

  return { endpoint: fallbackEndpoint, status: 0, error: "request_failed" };
}

function asScopes(value: unknown): string[] {
  if (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { scopes?: unknown }).scopes)
  ) {
    return (value as { scopes: unknown[] }).scopes.filter((scope): scope is string => typeof scope === "string");
  }

  return [];
}

function asSnapshotMetadata(value: unknown): SnapshotMetadata[] {
  if (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { snapshots?: unknown }).snapshots)
  ) {
    return (value as { snapshots: unknown[] }).snapshots.filter(
      (snapshot): snapshot is SnapshotMetadata =>
        typeof snapshot === "object" &&
        snapshot !== null &&
        typeof (snapshot as { id?: unknown }).id === "string",
    );
  }

  return [];
}

function paginatedItems<TItem>(value: unknown, arrayKey: "plays" | "albums"): {
  items: TItem[];
  hasMore: boolean;
} {
  if (typeof value !== "object" || value === null) return { items: [], hasMore: false };

  const record = value as Record<string, unknown>;
  return {
    items: Array.isArray(record[arrayKey]) ? (record[arrayKey] as TItem[]) : [],
    hasMore: record.hasMore === true,
  };
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      typeof (body as { error?: unknown }).error === "string"
    ) {
      return (body as { error: string }).error;
    }
  } catch {
    // Ignore non-JSON error bodies; callers only need a safe summary.
  }

  return response.statusText || "request_failed";
}

export async function fetchApiJson<T>(apiBase: string, accessToken: string, path: string): Promise<T> {
  const response = await fetch(new URL(path, apiBase), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ApiError(path, response.status, await parseErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

export async function fetchPaginated<TItem>(input: {
  apiBase: string;
  accessToken: string;
  path: string;
  arrayKey: "plays" | "albums";
  region: Region;
}): Promise<TItem[]> {
  const items: TItem[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(input.path, input.apiBase);
    url.searchParams.set("region", input.region);
    url.searchParams.set("limit", "100");
    url.searchParams.set("offset", String(offset));

    const payload = await fetchApiJson<unknown>(input.apiBase, input.accessToken, `${url.pathname}${url.search}`);
    const page = paginatedItems<TItem>(payload, input.arrayKey);
    items.push(...page.items);
    hasMore = page.hasMore;
    offset += 100;
  }

  return items;
}

async function collectRegion(input: {
  apiBase: string;
  accessToken: string;
  region: Region;
}): Promise<RegionExport> {
  const out = emptyRegionExport();

  const snapshotsEndpoint = `/api/v1/snapshots?region=${input.region}`;
  try {
    const metadata = asSnapshotMetadata(
      await fetchApiJson<unknown>(input.apiBase, input.accessToken, snapshotsEndpoint),
    );

    for (const snapshot of metadata) {
      const endpoint = `/api/v1/snapshots/${encodeURIComponent(snapshot.id)}?region=${input.region}`;
      try {
        out.snapshots.push(await fetchApiJson<unknown>(input.apiBase, input.accessToken, endpoint));
      } catch (error) {
        if (isApiAuthError(error)) throw error;
        out.errors.push(errorRecord(error, endpoint));
      }
    }
  } catch (error) {
    if (isApiAuthError(error)) throw error;
    out.errors.push(errorRecord(error, snapshotsEndpoint));
  }

  const recentsEndpoint = `/api/v1/recents?region=${input.region}&limit=100&offset=0`;
  try {
    out.recents = await fetchPaginated<unknown>({
      apiBase: input.apiBase,
      accessToken: input.accessToken,
      path: "/api/v1/recents",
      arrayKey: "plays",
      region: input.region,
    });
  } catch (error) {
    if (isApiAuthError(error)) throw error;
    out.errors.push(errorRecord(error, recentsEndpoint));
  }

  const statsEndpoint = `/api/v1/stats?region=${input.region}`;
  try {
    out.stats = await fetchApiJson<unknown>(input.apiBase, input.accessToken, statsEndpoint);
  } catch (error) {
    if (isApiAuthError(error)) throw error;
    out.errors.push(errorRecord(error, statsEndpoint));
  }

  const albumsEndpoint = `/api/v1/albums?region=${input.region}&limit=100&offset=0`;
  try {
    out.albums = await fetchPaginated<unknown>({
      apiBase: input.apiBase,
      accessToken: input.accessToken,
      path: "/api/v1/albums",
      arrayKey: "albums",
      region: input.region,
    });
  } catch (error) {
    if (isApiAuthError(error)) throw error;
    out.errors.push(errorRecord(error, albumsEndpoint));
  }

  return out;
}

export async function collectTakeoutExport(input: {
  apiBase: string;
  accessToken: string;
  regions?: readonly Region[];
}): Promise<TakeoutExport> {
  const selectedRegions = input.regions?.filter((region) => isRegion(region)) ?? REGIONS;
  const [me, settings, scopesPayload] = await Promise.all([
    fetchApiJson<unknown>(input.apiBase, input.accessToken, "/api/v1/me"),
    fetchApiJson<unknown>(input.apiBase, input.accessToken, "/api/v1/me/settings"),
    fetchApiJson<unknown>(input.apiBase, input.accessToken, "/api/v1/me/scopes"),
  ]);

  const regions: Record<Region, RegionExport> = {
    intl: emptyRegionExport(),
    jp: emptyRegionExport(),
    cn: emptyRegionExport(),
  };

  for (const region of selectedRegions) {
    regions[region] = await collectRegion({
      apiBase: input.apiBase,
      accessToken: input.accessToken,
      region,
    });
  }

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    source: {
      app: "tomomai-takeout",
      apiBase: input.apiBase,
    },
    account: {
      me,
      settings,
      scopes: asScopes(scopesPayload),
    },
    regions,
  };
}
