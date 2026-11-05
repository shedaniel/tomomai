import sharp from "sharp";

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
