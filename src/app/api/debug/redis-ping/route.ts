import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const N = 50;
  const samples: number[] = [];
  // Warm the connection.
  await redis.ping();

  for (let i = 0; i < N; i++) {
    const t = process.hrtime.bigint();
    await redis.ping();
    samples.push(Number(process.hrtime.bigint() - t) / 1_000_000);
  }
  samples.sort((a, b) => a - b);
  const avg = samples.reduce((a, b) => a + b, 0) / N;
  const p50 = samples[Math.floor(N * 0.5)];
  const p95 = samples[Math.floor(N * 0.95)];
  const p99 = samples[Math.floor(N * 0.99)];
  return NextResponse.json({
    n: N,
    avg_ms: +avg.toFixed(2),
    p50_ms: +p50.toFixed(2),
    p95_ms: +p95.toFixed(2),
    p99_ms: +p99.toFixed(2),
    min_ms: +samples[0].toFixed(2),
    max_ms: +samples[N - 1].toFixed(2),
    region: process.env.VERCEL_REGION ?? "unknown",
  });
}
