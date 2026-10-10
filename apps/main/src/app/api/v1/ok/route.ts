import { withApiKey } from "@/lib/api/protect";
import { zodJson } from "@/lib/api/zod-response";
import { spec } from "./spec";

export const GET = withApiKey(spec, async () => zodJson(spec.response, { ok: true }));
