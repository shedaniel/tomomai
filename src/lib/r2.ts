import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
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
