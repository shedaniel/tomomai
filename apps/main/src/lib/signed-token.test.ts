import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { sign, verify } from "./signed-token";

const secret = "test-secret";
const schema = z.strictObject({ userId: z.string(), exp: z.number() });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

it("returns the payload of a token it signed until the token expires", () => {
  const token = sign({ userId: "player" }, { secret, ttlSeconds: 600 });
  expect(token).toMatch(/^[\w-]+\.[\w-]+$/);
  expect(verify(token, schema, { secret })).toEqual({ userId: "player", exp: Date.now() / 1000 + 600 });
  vi.advanceTimersByTime(599_000);
  expect(verify(token, schema, { secret })).not.toBeNull();
  vi.advanceTimersByTime(1_000);
  expect(verify(token, schema, { secret })).toBeNull();
});

it("rejects a token signed with another secret or changed after signing", () => {
  const token = sign({ userId: "player" }, { secret, ttlSeconds: 600 });
  const [body, signature] = token.split(".");
  const otherBody = Buffer.from(JSON.stringify({ userId: "other", exp: Date.now() / 1000 + 600 })).toString("base64url");
  expect(verify(token, schema, { secret: "other-secret" })).toBeNull();
  expect(verify(`${otherBody}.${signature}`, schema, { secret })).toBeNull();
  expect(verify(`${body}.${signature.slice(0, -2)}`, schema, { secret })).toBeNull();
  expect(verify(`${token}.extra`, schema, { secret })).toBeNull();
  expect(verify(body, schema, { secret })).toBeNull();
});

it("rejects a signed payload the schema does not describe", () => {
  expect(verify(sign({ userId: "player", game: "maimai" }, { secret, ttlSeconds: 600 }), schema, { secret })).toBeNull();
  expect(verify(sign({ userId: "player" }, { secret }), schema, { secret })).toBeNull();
});

it("accepts a token without a lifetime when the schema has no expiry", () => {
  const token = sign({ userId: "player" }, { secret });
  expect(verify(token, z.object({ userId: z.string() }), { secret })).toEqual({ userId: "player" });
});
