import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "crypto";
import { nanoid } from "nanoid";

export const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET!;

export async function uploadToR2(
  buffer: Buffer,
  contentType: string = "image/avif"
): Promise<{ key: string; size: number }> {
  const key = `albums/${nanoid()}.avif`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000",
  });

  await r2Client.send(command);

  return { key, size: buffer.length };
}

export async function listCoverKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: "covers/",
      ContinuationToken: continuationToken,
    });

    const response = await r2Client.send(command);
    for (const obj of response.Contents ?? []) {
      if (obj.Key) {
        keys.add(obj.Key.replace(/^covers\//, ""));
      }
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

export async function uploadCoverToR2(
  buffer: Buffer,
  filename: string
): Promise<{ key: string; size: number }> {
  const key = `covers/${filename}.webp`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000",
  });

  await r2Client.send(command);

  return { key, size: buffer.length };
}

export async function deleteFromR2(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });

  await r2Client.send(command);
}

export async function r2ObjectExists(key: string): Promise<boolean> {
  try {
    await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    const name = (err as { name?: string })?.name;
    if (status === 404 || name === "NotFound" || name === "NoSuchKey") return false;
    throw err;
  }
}

function extensionForContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("avif")) return "avif";
  return "png";
}

export function iconKeyForBuffer(buffer: Buffer, contentType: string): string {
  const hash = createHash("sha256").update(buffer).digest("hex");
  return `icons/${hash}.${extensionForContentType(contentType)}`;
}

export async function uploadIconToR2(
  buffer: Buffer,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const key = iconKeyForBuffer(buffer, contentType);
  const url = iconPublicUrl(key);

  if (await r2ObjectExists(key)) {
    return { key, url };
  }

  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  return { key, url };
}

function iconPublicUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_R2_URL;
  if (!base) throw new Error("NEXT_PUBLIC_R2_URL is not set");
  return `${base.replace(/\/$/, "")}/${key}`;
}

export function isR2IconUrl(url: string): boolean {
  const base = process.env.NEXT_PUBLIC_R2_URL;
  const baseCn = process.env.NEXT_PUBLIC_R2_URL_CN;
  const prefixes = [base, baseCn].filter(Boolean).map((b) => `${b!.replace(/\/$/, "")}/icons/`);
  return prefixes.some((p) => url.startsWith(p));
}

export function avatarKeyForBuffer(buffer: Buffer, contentType: string): string {
  const hash = createHash("sha256").update(buffer).digest("hex");
  return `avatars/${hash}.${extensionForContentType(contentType)}`;
}

export async function uploadAvatarToR2(
  buffer: Buffer,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const key = avatarKeyForBuffer(buffer, contentType);
  const url = iconPublicUrl(key);

  if (await r2ObjectExists(key)) {
    return { key, url };
  }

  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  return { key, url };
}

export function isR2AvatarUrl(url: string): boolean {
  const base = process.env.NEXT_PUBLIC_R2_URL;
  const baseCn = process.env.NEXT_PUBLIC_R2_URL_CN;
  const prefixes = [base, baseCn].filter(Boolean).map((b) => `${b!.replace(/\/$/, "")}/avatars/`);
  return prefixes.some((p) => url.startsWith(p));
}

export type MirrorResult =
  | { url: string; reason?: undefined }
  | { url: null; reason: "dead" | "transient" };

export async function mirrorRemoteAvatarToR2(
  remoteUrl: string,
  { timeoutMs = 5000 }: { timeoutMs?: number } = {},
): Promise<MirrorResult> {
  if (isR2AvatarUrl(remoteUrl)) {
    return { url: remoteUrl };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(remoteUrl, { signal: controller.signal, redirect: "follow" });
  } catch {
    return { url: null, reason: "transient" };
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404 || response.status === 403 || response.status === 410) {
    return { url: null, reason: "dead" };
  }
  if (response.status >= 500) {
    return { url: null, reason: "transient" };
  }
  if (!response.ok) {
    return { url: null, reason: "dead" };
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("image/")) {
    return { url: null, reason: "dead" };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await response.arrayBuffer());
  } catch {
    return { url: null, reason: "transient" };
  }
  if (buffer.length === 0) {
    return { url: null, reason: "dead" };
  }

  try {
    const { url } = await uploadAvatarToR2(buffer, contentType);
    return { url };
  } catch {
    return { url: null, reason: "transient" };
  }
}

export function r2KeyFromIconUrl(url: string): string | null {
  const base = process.env.NEXT_PUBLIC_R2_URL;
  const baseCn = process.env.NEXT_PUBLIC_R2_URL_CN;
  for (const b of [base, baseCn]) {
    if (!b) continue;
    const prefix = `${b.replace(/\/$/, "")}/`;
    if (url.startsWith(prefix)) return url.slice(prefix.length);
  }
  return null;
}
