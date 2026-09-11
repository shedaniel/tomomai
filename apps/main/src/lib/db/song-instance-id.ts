import { sql } from "drizzle-orm";
import { parentSong, songs } from "./schema-pg";

export const songInstanceId = sql<string>`${parentSong.publicId} || ':' || CASE ${songs.region} WHEN 'jp' THEN 'j' WHEN 'intl' THEN 'i' WHEN 'cn' THEN 'c' END || ${songs.gameVersion}::text`;
