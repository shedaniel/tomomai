import { ImageResponse } from "next/og";
import path from "path";
import sharp from "sharp";
import type { Locale } from "@/i18n/locale";

export const OG_SIZE = { width: 1200, height: 630 };

// Pre-compute grid path: vertical + horizontal lines every 40px
const gridPath = [
  ...Array.from({ length: 31 }, (_, i) => `M ${i * 40} 0 L ${i * 40} 630`),
  ...Array.from({ length: 17 }, (_, i) => `M 0 ${i * 40} L 1200 ${i * 40}`),
].join(" ");

type Weight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
type FontEntry = { name: string; data: ArrayBuffer; style: "normal"; weight: Weight };

async function fetchTtfFromGoogleFonts(family: string, weight: number, text?: string): Promise<ArrayBuffer> {
  const params = new URLSearchParams({ family: `${family}:wght@${weight}` });
  if (text) params.set("text", text);
  const css = await fetch(
    `https://fonts.googleapis.com/css2?${params}`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; bot)" } },
  ).then((r) => r.text());
  const ttfUrl = css.match(/src: url\((.+?)\) format\('truetype'\)/)?.[1] ?? "";
  return fetch(ttfUrl).then((r) => r.arrayBuffer());
}

async function loadInterFonts(): Promise<FontEntry[]> {
  const [regular, semiBold, bold] = await Promise.all([
    fetchTtfFromGoogleFonts("Inter", 400),
    fetchTtfFromGoogleFonts("Inter", 600),
    fetchTtfFromGoogleFonts("Inter", 700),
  ]);
  return [
    { name: "Inter", data: regular, style: "normal" as const, weight: 400 as Weight },
    { name: "Inter", data: semiBold, style: "normal" as const, weight: 600 as Weight },
    { name: "Inter", data: bold, style: "normal" as const, weight: 700 as Weight },
  ];
}

async function loadLocaleFonts(locale: Locale, text: string): Promise<FontEntry[]> {
  // Mirror the logic from src/app/layout.tsx
  const needsJP = true; // NotoSansJP covers ja + ko + fallback
  const needsTC = locale === "zh-TW" || locale === "zh-HK" || locale === "yue";
  const needsSC = locale === "zh-CN";

  const fetches: Promise<FontEntry[]>[] = [];

  if (needsJP) {
    fetches.push(
      Promise.all([
        fetchTtfFromGoogleFonts("Noto Sans JP", 600, text),
        fetchTtfFromGoogleFonts("Noto Sans JP", 700, text),
      ]).then(([semiBold, bold]) => [
        { name: "Noto Sans JP", data: semiBold, style: "normal" as const, weight: 600 },
        { name: "Noto Sans JP", data: bold, style: "normal" as const, weight: 700 },
      ]),
    );
  }

  if (needsTC) {
    fetches.push(
      Promise.all([
        fetchTtfFromGoogleFonts("Noto Sans TC", 600, text),
        fetchTtfFromGoogleFonts("Noto Sans TC", 700, text),
      ]).then(([semiBold, bold]) => [
        { name: "Noto Sans TC", data: semiBold, style: "normal" as const, weight: 600 },
        { name: "Noto Sans TC", data: bold, style: "normal" as const, weight: 700 },
      ]),
    );
  }

  if (needsSC) {
    fetches.push(
      Promise.all([
        fetchTtfFromGoogleFonts("Noto Sans SC", 600, text),
        fetchTtfFromGoogleFonts("Noto Sans SC", 700, text),
      ]).then(([semiBold, bold]) => [
        { name: "Noto Sans SC", data: semiBold, style: "normal" as const, weight: 600 },
        { name: "Noto Sans SC", data: bold, style: "normal" as const, weight: 700 },
      ]),
    );
  }

  return (await Promise.all(fetches)).flat();
}

/** Returns the CSS font-family stack for a given locale, matching layout.tsx */
function getFontFamily(locale: Locale): string {
  switch (locale) {
    case "zh-TW":
    case "zh-HK":
    case "yue":
      return "Inter, Noto Sans TC, Noto Sans JP";
    case "zh-CN":
      return "Inter, Noto Sans SC, Noto Sans JP";
    default:
      return "Inter, Noto Sans JP";
  }
}

async function loadIcon(file: string, height: number) {
  const filePath = path.join(process.cwd(), "public", file);
  const meta = await sharp(filePath).metadata();
  const width = meta.width && meta.height
    ? Math.round((meta.width / meta.height) * height)
    : height;
  const png = await sharp(filePath).resize(width, height).png().toBuffer();
  return { dataUrl: `data:image/png;base64,${png.toString("base64")}`, width, height };
}

export type OGImageOptions = {
  /** Subtitle shown next to "tomomai ·" in the top bar */
  section: string;
  title: string;
  summary?: string;
  /** Optional bottom label (e.g. a date string) */
  label?: string;
  locale?: Locale;
};

export async function createOGImage(options: OGImageOptions) {
  const { section, title, summary, label, locale = "en" } = options;

  // Collect all rendered text for CJK font subsetting
  const allText = [section, title, summary, label].filter(Boolean).join("");

  const [interFonts, localeFonts, icon] = await Promise.all([
    loadInterFonts(),
    loadLocaleFonts(locale, allText),
    loadIcon("icon-dark.webp", 48),
  ]);

  const fonts = [...interFonts, ...localeFonts];
  const fontFamily = getFontFamily(locale);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#09090b",
          fontFamily,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Grid pattern */}
        <svg style={{ position: "absolute", inset: "0" }} width="1200" height="630">
          <path d={gridPath} stroke="rgba(255,255,255,0.04)" strokeWidth="1" fill="none" />
        </svg>

        {/* Purple glow — top right */}
        <div
          style={{
            position: "absolute",
            top: "-160px",
            right: "-120px",
            width: "600px",
            height: "600px",
            borderRadius: "9999px",
            background: "radial-gradient(circle, rgba(139,92,246,0.35) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Cyan glow — bottom left */}
        <div
          style={{
            position: "absolute",
            bottom: "-140px",
            left: "-100px",
            width: "520px",
            height: "520px",
            borderRadius: "9999px",
            background: "radial-gradient(circle, rgba(6,182,212,0.28) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            padding: "56px 64px",
            position: "relative",
          }}
        >
          {/* Top row: site label + icon */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "#fafafa", fontSize: "20px", fontWeight: 700 }}>
                tomomai
              </span>
              <span style={{ color: "#a1a1aa", fontSize: "20px", fontWeight: 400 }}>
                · {section}
              </span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={icon.dataUrl} width={icon.width} height={icon.height} alt="tomomai icon" />
          </div>

          {/* Middle: title + summary */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div
              style={{
                color: "#fafafa",
                fontSize: "56px",
                fontWeight: 700,
                lineHeight: 1.1,
                maxWidth: "950px",
              }}
            >
              {title}
            </div>
            {summary && (
              <div
                style={{
                  color: "#a1a1aa",
                  fontSize: "22px",
                  fontWeight: 600,
                  lineHeight: 1.5,
                  maxWidth: "800px",
                }}
              >
                {summary.length > 200 ? summary.slice(0, 200) + "…" : summary}
              </div>
            )}
          </div>

          {/* Bottom: decorative bar + label */}
          {label && (
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div
                style={{
                  width: "36px",
                  height: "3px",
                  borderRadius: "9999px",
                  background: "linear-gradient(90deg, #8b5cf6, #06b6d4)",
                  display: "flex",
                }}
              />
              <span style={{ color: "#a1a1aa", fontSize: "18px", fontWeight: 600 }}>{label}</span>
            </div>
          )}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
