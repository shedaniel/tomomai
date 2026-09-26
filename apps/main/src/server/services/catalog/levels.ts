import { getLogger } from "@/lib/request-logger";

export function parseDisplayLevel(level: string, plusOffset: number): number {
  const trimmed = level.trim();
  const plus = trimmed.endsWith("+");
  const base = parseInt(plus ? trimmed.slice(0, -1) : trimmed, 10);
  if (Number.isNaN(base)) {
    getLogger().warn({ from: level }, "Invalid chart level; defaulting to 1.0");
    return 10;
  }
  return base * 10 + (plus ? plusOffset : 0);
}
