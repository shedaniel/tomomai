import { getRedis } from "@tomomai/security/redis";

const r = getRedis();
if (!r) {
  throw new Error("REDIS_URL is required");
}

export const redis = r;
