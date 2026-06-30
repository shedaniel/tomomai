/**
 * Binary encoder/decoder for render token v1.
 *
 * Wire format (all multi-byte ints big-endian):
 *   message = HEADER || ROUTE_PAYLOAD
 *   token   = base64url(message) || "." || base64url(HMAC-SHA256(secret, message))
 *
 * Version byte 0x01. If ≠ 0x01 on decode → reject. No migration.
 *
 * See docs/render-token-v1.md for the full spec.
 */

import type {
  ChartRecord,
  ExportImagePayload,
  LastCreditPayload,
  DailyPlaysPayload,
  RenderHeader,
  RenderMessage,
  TrackRecord,
} from "./message";
import type {
  Difficulty,
  FullCombo,
  FullSync,
  NoteCounts,
  Region,
  Route,
  TitleType,
} from "./types";
import {
  DIFFICULTIES,
  FULL_COMBOS,
  FULL_SYNCS,
  REGIONS,
  TITLE_TYPES,
} from "./types";

// ---- version ----

export const VERSION = 0x01;

const ROUTE_IDS: readonly Route[] = ["export-image", "last-credit", "daily-plays"];

// ---- ByteWriter ----

class ByteWriter {
  private buf: number[] = [];

  u8(v: number): void {
    this.buf.push(v & 0xff);
  }

  u16(v: number): void {
    this.buf.push((v >>> 8) & 0xff, v & 0xff);
  }

  u24(v: number): void {
    this.buf.push((v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  }

  u32(v: number): void {
    this.buf.push(
      (v >>> 24) & 0xff,
      (v >>> 16) & 0xff,
      (v >>> 8) & 0xff,
      v & 0xff,
    );
  }

  /** ASCII bytes, fixed width. Caller must guarantee `str.length === len`. */
  asciiFixed(str: string, len: number): void {
    for (let i = 0; i < len; i++) {
      this.buf.push(i < str.length ? str.charCodeAt(i) & 0xff : 0);
    }
  }

  /** u8 length || UTF-8 bytes (strings ≤ 255 bytes). */
  l8(str: string): void {
    const bytes = utf8(str);
    if (bytes.length > 255) throw new EncodeError(`L8 string too long (${bytes.length} bytes): ${str}`);
    this.u8(bytes.length);
    for (const b of bytes) this.buf.push(b);
  }

  /** Optional L8: 0 = absent, 1 = present + L8 value. */
  l8Optional(str: string | null | undefined): void {
    if (str == null) {
      this.u8(0);
    } else {
      this.u8(1);
      this.l8(str);
    }
  }

  /** u16 length || UTF-8 bytes (URLs, up to 65535 bytes). */
  l16(str: string): void {
    const bytes = utf8(str);
    if (bytes.length > 65535) throw new EncodeError(`L16 string too long (${bytes.length} bytes)`);
    this.u16(bytes.length);
    for (const b of bytes) this.buf.push(b);
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

// ---- ByteReader ----

class ByteReader {
  private pos = 0;
  constructor(private readonly data: Uint8Array) {}

  remaining(): number {
    return this.data.length - this.pos;
  }

  u8(): number {
    this.ensure(1);
    return this.data[this.pos++]!;
  }

  u16(): number {
    this.ensure(2);
    return (this.data[this.pos++]! << 8) | this.data[this.pos++]!;
  }

  u24(): number {
    this.ensure(3);
    return (
      (this.data[this.pos++]! << 16) |
      (this.data[this.pos++]! << 8) |
      this.data[this.pos++]!
    );
  }

  u32(): number {
    this.ensure(4);
    return (
      (this.data[this.pos++]! * 0x1000000) +
      ((this.data[this.pos++]! << 16) |
        (this.data[this.pos++]! << 8) |
        this.data[this.pos++]!)
    );
  }

  asciiFixed(len: number): string {
    this.ensure(len);
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(this.data[this.pos++]!);
    return s;
  }

  l8(): string {
    const len = this.u8();
    this.ensure(len);
    const s = utf8Slice(this.data, this.pos, this.pos + len);
    this.pos += len;
    return s;
  }

  l8Optional(): string | null {
    const present = this.u8();
    return present === 0 ? null : this.l8();
  }

  l16(): string {
    const len = this.u16();
    this.ensure(len);
    const s = utf8Slice(this.data, this.pos, this.pos + len);
    this.pos += len;
    return s;
  }

  private ensure(n: number): void {
    if (this.pos + n > this.data.length) {
      throw new DecodeError(`unexpected end of message (need ${n} at offset ${this.pos}, have ${this.data.length})`);
    }
  }
}

// ---- UTF-8 helpers (avoid TextEncoder/TextDecoder for port clarity) ----

function utf8(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(++i);
      c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
    }
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
    }
  }
  return out;
}

function utf8Slice(data: Uint8Array, start: number, end: number): string {
  let s = "";
  let i = start;
  while (i < end) {
    const b = data[i++]!;
    if (b < 0x80) {
      s += String.fromCharCode(b);
    } else if (b < 0xe0) {
      s += String.fromCharCode(((b & 0x1f) << 6) | (data[i++]! & 0x3f));
    } else if (b < 0xf0) {
      s += String.fromCharCode(
        ((b & 0x0f) << 12) | ((data[i++]! & 0x3f) << 6) | (data[i++]! & 0x3f),
      );
    } else {
      const cp =
        ((b & 0x07) << 18) |
        ((data[i++]! & 0x3f) << 12) |
        ((data[i++]! & 0x3f) << 6) |
        (data[i++]! & 0x3f);
      const adj = cp - 0x10000;
      s += String.fromCharCode(0xd800 + (adj >> 10), 0xdc00 + (adj & 0x3ff));
    }
  }
  return s;
}

// ---- Enum index helpers ----

function enumIndex<T extends string>(arr: readonly T[], v: T): number {
  const i = arr.indexOf(v);
  if (i < 0) throw new EncodeError(`enum value not in set: ${v}`);
  return i;
}

function enumValue<T extends string>(arr: readonly T[], i: number): T {
  if (i < 0 || i >= arr.length) throw new DecodeError(`enum index out of range: ${i}`);
  return arr[i]!;
}

// ---- Errors ----

export class EncodeError extends Error {}
export class DecodeError extends Error {}

// ---- SONG_ID constant ----

/** Current `songs.publicId` length. Bumps to a new VERSION when this changes. */
export const SONG_ID_LEN = 21;

// ---- ENCODE ----

export function encodeMessage(msg: RenderMessage): Uint8Array {
  const w = new ByteWriter();
  // VERSION (offset 0) + route (offset 1) per spec.
  w.u8(VERSION);
  w.u8(ROUTE_IDS.indexOf(msg.route));
  encodeHeader(w, msg.header);
  switch (msg.route) {
    case "export-image":
      encodeExportImage(w, msg.payload);
      break;
    case "last-credit":
      encodeLastCredit(w, msg.payload);
      break;
    case "daily-plays":
      encodeDailyPlays(w, msg.payload);
      break;
  }
  return w.toUint8Array();
}

/** Writes everything AFTER version+route (scale onward). */
function encodeHeader(w: ByteWriter, h: RenderHeader): void {
  w.u8(h.scale);
  w.u32(h.exp);
  w.u8(h.gameVersion);
  w.u8(enumIndex(REGIONS, h.region));
  w.u16(h.rating);
  w.l8(h.displayName);
  w.l16(h.iconUrl);
  w.l8(h.title);
  w.u8(enumIndex(TITLE_TYPES, h.titleType));
  w.l16(h.classRankUrl);
  w.l16(h.courseRankUrl);
}

function encodeExportImage(w: ByteWriter, p: ExportImagePayload): void {
  w.l8Optional(p.visitableProfileAt);
  w.u8(p.charts.length);
  for (const c of p.charts) encodeChart(w, c);
}

function encodeLastCredit(w: ByteWriter, p: LastCreditPayload): void {
  w.u32(p.playedAt);
  w.u8(p.tracks.length);
  for (const t of p.tracks) encodeTrack(w, t);
}

function encodeDailyPlays(w: ByteWriter, p: DailyPlaysPayload): void {
  w.l8(p.day);
  w.u8(p.plays.length);
  for (const c of p.plays) encodeChart(w, c);
}

function encodeChart(w: ByteWriter, c: ChartRecord): void {
  if (c.songId.length !== SONG_ID_LEN) {
    throw new EncodeError(`songId must be ${SONG_ID_LEN} chars, got ${c.songId.length}: ${c.songId}`);
  }
  w.asciiFixed(c.songId, SONG_ID_LEN);
  w.u24(c.achievement);
  w.u8(enumIndex(FULL_COMBOS, c.fc));
  w.u8(enumIndex(FULL_SYNCS, c.fs));
}

function encodeTrack(w: ByteWriter, t: TrackRecord): void {
  if (t.songId.length !== SONG_ID_LEN) {
    throw new EncodeError(`songId must be ${SONG_ID_LEN} chars, got ${t.songId.length}`);
  }
  w.asciiFixed(t.songId, SONG_ID_LEN);
  w.u24(t.achievement);
  w.u8(enumIndex(FULL_COMBOS, t.fc));
  w.u8(enumIndex(FULL_SYNCS, t.fs));
  w.u32(t.dxScore);
  w.u32(t.maxDxScore);
  w.u8(t.details ? 1 : 0);
  if (t.details) {
    w.u16(t.details.fastCount);
    w.u16(t.details.lateCount);
    encodeNoteCounts(w, t.details.tap);
    encodeNoteCounts(w, t.details.hold);
    encodeNoteCounts(w, t.details.slide);
    encodeNoteCounts(w, t.details.touch);
    encodeNoteCounts(w, t.details.break);
  }
}

function encodeNoteCounts(w: ByteWriter, n: NoteCounts): void {
  w.u16(n.criticalPerfect);
  w.u16(n.perfect);
  w.u16(n.great);
  w.u16(n.good);
  w.u16(n.miss);
}

// ---- DECODE ----

export function decodeMessage(data: Uint8Array): RenderMessage {
  const r = new ByteReader(data);
  const version = r.u8();
  if (version !== VERSION) {
    throw new DecodeError(`unsupported version ${version} (expected ${VERSION})`);
  }
  const routeId = r.u8();
  const route = ROUTE_IDS[routeId];
  if (!route) throw new DecodeError(`unknown route id ${routeId}`);

  const header = decodeHeader(r);
  let payload: ExportImagePayload | LastCreditPayload | DailyPlaysPayload;
  switch (route) {
    case "export-image":
      payload = decodeExportImage(r);
      break;
    case "last-credit":
      payload = decodeLastCredit(r);
      break;
    case "daily-plays":
      payload = decodeDailyPlays(r);
      break;
  }
  // Trailing bytes are allowed (forward-compat ignore). We don't enforce
  // r.remaining() === 0; the HMAC covers the exact bytes so tampering is
  // already caught by signature verification.
  return { route, header, payload } as RenderMessage;
}

function decodeHeader(r: ByteReader): RenderHeader {
  const scale = r.u8();
  if (scale !== 1 && scale !== 2) throw new DecodeError(`invalid scale ${scale}`);
  const exp = r.u32();
  const gameVersion = r.u8();
  const region = enumValue(REGIONS, r.u8());
  const rating = r.u16();
  const displayName = r.l8();
  const iconUrl = r.l16();
  const title = r.l8();
  const titleType = enumValue(TITLE_TYPES, r.u8());
  const classRankUrl = r.l16();
  const courseRankUrl = r.l16();
  return {
    scale,
    exp,
    gameVersion,
    region,
    rating,
    displayName,
    iconUrl,
    title,
    titleType,
    classRankUrl,
    courseRankUrl,
  };
}

function decodeExportImage(r: ByteReader): ExportImagePayload {
  const visitableProfileAt = r.l8Optional();
  const count = r.u8();
  const charts: ChartRecord[] = [];
  for (let i = 0; i < count; i++) charts.push(decodeChart(r));
  return { visitableProfileAt, charts };
}

function decodeLastCredit(r: ByteReader): LastCreditPayload {
  const playedAt = r.u32();
  const count = r.u8();
  const tracks: TrackRecord[] = [];
  for (let i = 0; i < count; i++) tracks.push(decodeTrack(r));
  return { playedAt, tracks };
}

function decodeDailyPlays(r: ByteReader): DailyPlaysPayload {
  const day = r.l8();
  const count = r.u8();
  const plays: ChartRecord[] = [];
  for (let i = 0; i < count; i++) plays.push(decodeChart(r));
  return { day, plays };
}

function decodeChart(r: ByteReader): ChartRecord {
  const songId = r.asciiFixed(SONG_ID_LEN);
  const achievement = r.u24();
  const fc = enumValue(FULL_COMBOS, r.u8());
  const fs = enumValue(FULL_SYNCS, r.u8());
  return { songId, achievement, fc, fs };
}

function decodeTrack(r: ByteReader): TrackRecord {
  const songId = r.asciiFixed(SONG_ID_LEN);
  const achievement = r.u24();
  const fc = enumValue(FULL_COMBOS, r.u8());
  const fs = enumValue(FULL_SYNCS, r.u8());
  const dxScore = r.u32();
  const maxDxScore = r.u32();
  const hasDetails = r.u8() === 1;
  let details: TrackRecord["details"] = null;
  if (hasDetails) {
    const fastCount = r.u16();
    const lateCount = r.u16();
    const tap = decodeNoteCounts(r);
    const hold = decodeNoteCounts(r);
    const slide = decodeNoteCounts(r);
    const touch = decodeNoteCounts(r);
    const breakN = decodeNoteCounts(r);
    details = { fastCount, lateCount, tap, hold, slide, touch, break: breakN };
  }
  return { songId, achievement, fc, fs, dxScore, maxDxScore, details };
}

function decodeNoteCounts(r: ByteReader): NoteCounts {
  const criticalPerfect = r.u16();
  const perfect = r.u16();
  const great = r.u16();
  const good = r.u16();
  const miss = r.u16();
  return { criticalPerfect, perfect, great, good, miss };
}

// ---- Exported enums for consumers that need the ordered sets ----

export {
  DIFFICULTIES,
  FULL_COMBOS,
  FULL_SYNCS,
  REGIONS,
  TITLE_TYPES,
};
export type {
  Difficulty,
  FullCombo,
  FullSync,
  NoteCounts,
  Region,
  Route,
  TitleType,
};
