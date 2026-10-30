import sharp from "sharp";
import { maimaiImageRequest } from "./maimai/http";

export async function convertJpegToAvif(
  jpegBuffer: Buffer,
  quality: number = 0
): Promise<Buffer> {
  return sharp(jpegBuffer)
    .avif({ quality })
    .toBuffer();
}

export async function convertToWebp(
  buffer: Buffer,
  quality: number = 80
): Promise<Buffer> {
  return sharp(buffer).webp({ quality }).toBuffer();
}

export async function fetchImageBuffer(url: string, cookies: string): Promise<Buffer> {
  const response = await maimaiImageRequest(url, cookies);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
