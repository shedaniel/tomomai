import sharp from "sharp";
import { AGENT } from "./maimai-fetcher";

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

export async function fetchImageBuffer(url: string, cookies: any): Promise<Buffer> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Cookie": cookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
    ...{ dispatcher: AGENT },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
