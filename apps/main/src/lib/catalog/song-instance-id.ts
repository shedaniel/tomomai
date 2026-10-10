import { z } from "zod";
import { PARENT_PUBLIC_ID_PATTERN, SONG_INSTANCE_ID_PATTERN } from "@tomomai/games/song-ids";

export const parentPublicIdSchema = z.string().regex(PARENT_PUBLIC_ID_PATTERN);
export const songInstanceIdSchema = z.string().regex(SONG_INSTANCE_ID_PATTERN);
