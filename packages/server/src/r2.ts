import { DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET!;

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

// Immutable, versioned artifact object.
export async function uploadCatalogArtifact(key: string, body: Buffer): Promise<void> {
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: "application/gzip",
    CacheControl: "public, max-age=31536000, immutable",
  }));
}

// Mutable pointer at a stable URL; keep cache lifetime short so consumers
// notice new sequences quickly.
export async function uploadCatalogManifest(key: string, body: Buffer): Promise<void> {
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: "application/json",
    CacheControl: "public, max-age=300",
  }));
}

export async function deleteFromR2(key: string): Promise<void> {
  await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
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
