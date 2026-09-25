import deepEqual from "deep-equal";
import type { CatalogFetchContext, CatalogLogger } from "@/server/services/catalog/ingestion/types";

export type FetchingContextExtended<T, C extends CatalogFetchContext> = C & {
  previous: Fetcher<T, C> | null;
  current: Fetcher<T, C>;
  fetcherIndex: number;
};
export type Fetcher<T, C extends CatalogFetchContext> = (context: FetchingContextExtended<T, C>, songs: T[]) => Promise<T[]>;
export type Attributed<T> = T & { addedFetcher: number; modifiedFetchers: number[] };
export type FetcherDefinition<T, C extends CatalogFetchContext, R> = {
  fetchers: Fetcher<T, C>[];
  names: string[];
  key: (song: T) => string;
  validate: (songs: T[], log: CatalogLogger) => void;
  complete: (song: T, context: C) => R;
  notify?: (title: string, body: string, color: number) => Promise<void>;
};

export function createNoticeSink() {
  const details: string[] = [];
  return { details, addDetail(detail: string) { details.push(detail); } };
}

export function requireCatalogValue<T>(value: T | null | undefined, field: string, songKey: string, log: CatalogLogger): T {
  if (value === null || value === undefined) {
    log.error({ songKey }, `Value is null or undefined for ${field}`);
    throw new Error(`Value is null or undefined for ${field}`);
  }
  return value;
}

function summarizeStage<T>(songs: Attributed<T>[], fetcherIndex: number, fetcherName: string, songsBefore: number, elapsed: number, notice: { details: string[] }, key: (song: T) => string): { summary: string; noticeBody: string } {
  const addedSongs = songs.filter(s => s.addedFetcher === fetcherIndex);
  const modifiedSongs = songs.filter(s => s.addedFetcher !== fetcherIndex && s.modifiedFetchers.includes(fetcherIndex));
  const netChange = songs.length - songsBefore;

  const header = `**${fetcherName}**: ${songs.length} songs (${netChange >= 0 ? "+" : ""}${netChange}) — ${elapsed}ms`;
  const changeLine = `+${addedSongs.length} added, ~${modifiedSongs.length} modified`;

  const lines: string[] = [changeLine];
  if (addedSongs.length > 0 && addedSongs.length < 30) {
    lines.push("Added: " + addedSongs.map(s => key(s)).join(", "));
  }
  if (modifiedSongs.length > 0 && modifiedSongs.length < 30) {
    lines.push("Modified: " + modifiedSongs.map(s => key(s)).join(", "));
  }
  lines.push(...notice.details);

  const detailBlock = lines.join("\n");
  return {
    summary: `${header}\n${changeLine}${notice.details.length > 0 ? "\n" + notice.details.join("\n") : ""}`,
    noticeBody: `${header}\n${detailBlock}`,
  };
}

function attributeSource<T>(prevSongs: Attributed<T>[], newSongs: T[], fetcherIndex: number, key: (song: T) => string): Attributed<T>[] {
  // Compare the songs, if new song entry, set addedFetcher, otherwise compare if modified, if yes, set modifiedFetcher
  return newSongs.map(newSong => {
    const existingSong = prevSongs.find(s => key(s) === key(newSong));
    if (!existingSong) {
      return { ...newSong, addedFetcher: fetcherIndex, modifiedFetchers: [fetcherIndex] };
    }
    if (!deepEqual(existingSong, newSong)) {
      return { ...newSong, addedFetcher: existingSong.addedFetcher, modifiedFetchers: [...existingSong.modifiedFetchers, fetcherIndex] };
    }
    return existingSong;
  });
}

export async function runFetchers<T, C extends CatalogFetchContext, R>(context: C, definition: FetcherDefinition<T, C, R>): Promise<R[]> {
  context.log.info(
    { region: context.region, version: context.version },
    "Starting level fetch pipeline"
  );

  const { fetchers, names, key } = definition;

  let songs: Attributed<T>[] = []
  let previous: Fetcher<T, C> | null = null;
  let index = 0;
  for (const fetcher of fetchers) {
    const fetcherName = names[index] ?? `Fetcher ${index}`;
    const logger = context.log.child({ index });
    const notice = createNoticeSink();
    const extendedContext = {
      ...context,
      log: logger,
      notice,
      previous: previous,
      current: fetcher,
      fetcherIndex: index,
    };
    extendedContext.log.info("Fetcher starting...");
    const songsBefore = songs.length;
    const startTime = Date.now();
    const newSongs = await fetcher(extendedContext, songs);
    const elapsed = Date.now() - startTime;
    songs = attributeSource(songs, newSongs, index, key)
    const stage = summarizeStage(songs, index, fetcherName, songsBefore, elapsed, notice, key);

    definition.notify?.(
      `Stage ${index + 1}/${fetchers.length}: ${fetcherName}`,
      stage.noticeBody,
      0x5865F2,
    ).catch(() => { });

    previous = fetcher;
    index++;
    definition.validate(songs, extendedContext.log);
  }

  const completed: R[] = [];
  const errors: unknown[] = [];
  for (const song of songs) {
    try { completed.push(definition.complete(song, context)); }
    catch (err) { errors.push(err); }
  }
  if (errors.length) {
    context.log.error({ errorCount: errors.length, songCount: songs.length }, "Errors occurred during song update");
    throw new AggregateError(errors, "Errors occurred during song update");
  }
  context.log.info(
    { songCount: songs.length },
    "Fetch pipeline completed successfully"
  );

  {
    definition.notify?.(
      "Fetch pipeline completed",
      `**Total songs: ${songs.length}** (${fetchers.length} stages)`,
      0x00FF00,
    ).catch(() => { });
  }

  return completed;
}
