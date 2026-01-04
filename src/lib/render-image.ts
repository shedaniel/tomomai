import type { CanvasRenderingContext2D as SkiaContext } from 'skia-canvas';
import { Canvas, Image, loadImage } from 'skia-canvas';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './image-spec';
import { getRatingImageUrl, RatingCalculationInput, splitSongs } from "./rating-calculator";
import type { Difficulty, FullSync, SongType } from "./types";
import { SnapshotWithSongs } from "./types";

export interface SongForRender extends RatingCalculationInput {
  songName: string;
  cover: string;
  difficulty: Difficulty;
  type: SongType;
  fs: FullSync;
}

const TARGET_HEIGHT = 204;
const PADDING = 36;

const FONT_FAMILY = 'Inter, Murecho, "Noto Sans JP"';
const FONT_FAMILY_MONO = '"Geist Mono"';

const VERSION_SETTINGS = {
  10: {
    backgroundGradient: [
      { offset: 1, color: '#BFCCF2' },
      { offset: 0, color: '#C0F4E2' },
    ],
    character: {
      scaleX: 0.56,
      scaleY: 0.56,
      left: CANVAS_WIDTH - 580,
      top: -100,
      opacity: 1.0,
    },
    premadeDecoration: true,
    contentBackgroundColor: '#00000010',
    footerBackgroundColor: '#00000020',
  },
  11: {
    backgroundGradient: [
      { offset: 1, color: '#F5BAC8' },
      { offset: 0, color: '#F6D7FC' },
    ],
    character: {
      scaleX: 0.7,
      scaleY: 0.7,
      left: CANVAS_WIDTH - 520,
      top: -100,
      opacity: 1.0,
    },
    premadeDecoration: true,
    contentBackgroundColor: '#00000020',
    footerBackgroundColor: '#00000040',
  },
  12: {
    backgroundGradient: [
      { offset: 1, color: '#fbdffe' },
      { offset: 0, color: '#fdb2e0' },
    ],
    character: {
      scaleX: 0.6,
      scaleY: 0.6,
      left: CANVAS_WIDTH - 540,
      top: -30,
      opacity: 1.0,
    },
    premadeDecoration: true,
    contentBackgroundColor: '#00000020',
    footerBackgroundColor: '#00000040',
  },
}

export type ImageCache = {
  // path to Image object
  [key: string]: () => Promise<Image>;
}

// Helper to check if a URL is a data URL (base64)
function isDataUrl(url: string): boolean {
  return url.startsWith('data:');
}

// Helper to convert relative URLs to absolute URLs (for server-side rendering)
function toAbsoluteUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // Get base URL from environment or default to localhost
  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
  return `${baseUrl}${url}`;
}

// Helper to load images with caching
async function loadImageWithCache(cache: ImageCache, url: string): Promise<Image> {
  if (isDataUrl(url)) {
    return loadImage(url);
  }
  // Use the original URL as the cache key, but load with absolute URL
  if (cache[url]) {
    return await cache[url]();
  }

  console.log("🔍 Loading image from URL:", url);

  const absoluteUrl = toAbsoluteUrl(url);
  const img = await loadImage(absoluteUrl);
  cache[url] = () => Promise.resolve(img);
  return img;
}

export async function renderImage(data: SnapshotWithSongs<SongForRender>, cache: ImageCache, visitableProfileAt: string | null): Promise<Canvas> {
  const canvas = new Canvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d') as SkiaContext;

  await renderBackground(ctx, data, cache);
  const overlayRect = await renderHeader(ctx, data, cache);
  await renderContent(ctx, data, cache, overlayRect);
  await renderFooter(ctx, data, visitableProfileAt);

  return canvas;
}

async function renderBackground<S>(ctx: SkiaContext, data: SnapshotWithSongs<S>, cache: ImageCache) {
  const gradientStops = VERSION_SETTINGS[data.snapshot.gameVersion as keyof typeof VERSION_SETTINGS]?.backgroundGradient || [];
  const gradient = ctx.createLinearGradient(0, CANVAS_HEIGHT, 0, 0);

  for (const stop of gradientStops) {
    gradient.addColorStop(stop.offset, stop.color);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (VERSION_SETTINGS[data.snapshot.gameVersion as keyof typeof VERSION_SETTINGS]?.premadeDecoration) {
    const backgroundImg = await loadImageWithCache(cache, `/res/bg/${data.snapshot.gameVersion}.png`);
    ctx.drawImage(backgroundImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
}

async function renderHeaderBackground<S>(
  ctx: SkiaContext,
  data: SnapshotWithSongs<S>,
  cache: ImageCache,
) {
  const INNER_PADDING = 30;

  if (!VERSION_SETTINGS[data.snapshot.gameVersion as keyof typeof VERSION_SETTINGS]?.premadeDecoration) {
    // Render shine image
    const shineImg = await loadImageWithCache(cache, `/res/shine/${data.snapshot.gameVersion}.png`);
    const shineScale = CANVAS_WIDTH / shineImg.width;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.drawImage(shineImg, 0, 0, CANVAS_WIDTH, shineImg.height * shineScale);
    ctx.restore();

    // Render cloud image
    const cloudImg = await loadImageWithCache(cache, `/res/down/${data.snapshot.gameVersion}.png`);
    const cloudScale = CANVAS_WIDTH / cloudImg.width;
    const cloudHeight = cloudImg.height * cloudScale;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.drawImage(cloudImg, 0, CANVAS_HEIGHT - cloudHeight, CANVAS_WIDTH, cloudHeight);
    ctx.restore();
  }

  // Render character with clipping
  const characterSettings = VERSION_SETTINGS[data.snapshot.gameVersion as keyof typeof VERSION_SETTINGS]?.character || {
    scaleX: 0.56,
    scaleY: 0.56,
    left: CANVAS_WIDTH - 580,
    top: -100,
    opacity: 0.9,
  };
  const characterImg = await loadImageWithCache(cache, `/res/character/${data.snapshot.gameVersion}.png`);

  ctx.save();
  ctx.globalAlpha = characterSettings.opacity;
  ctx.beginPath();
  ctx.rect(0, 0, CANVAS_WIDTH, TARGET_HEIGHT + PADDING * 2);
  ctx.clip();
  ctx.drawImage(
    characterImg,
    characterSettings.left,
    characterSettings.top,
    characterImg.width * characterSettings.scaleX,
    characterImg.height * characterSettings.scaleY
  );
  ctx.restore();

  // Render logo with shadow
  const logoImg = await loadImageWithCache(cache, `/res/logo/${data.snapshot.gameVersion}.png`);
  const logoScale = (TARGET_HEIGHT - INNER_PADDING * 2) / logoImg.height;
  const logoWidth = logoImg.width * logoScale;
  const logoHeight = logoImg.height * logoScale;
  const characterLeft = characterSettings.left;
  const characterWidth = characterImg.width * characterSettings.scaleX;
  const logoLeft = characterLeft + characterWidth / 2 - logoWidth / 2;
  const logoTop = TARGET_HEIGHT - logoHeight / 2;

  ctx.save();
  ctx.shadowColor = '#FFFFFF50';
  ctx.shadowBlur = 32;
  ctx.drawImage(logoImg, logoLeft, logoTop, logoWidth, logoHeight);
  ctx.restore();
}

// Helper to measure text width
function measureTextWidth(ctx: SkiaContext, text: string): number {
  return ctx.measureText(text).width;
}

// Helper to draw rounded rectangle
function roundRect(ctx: SkiaContext, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

type OverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

async function renderHeader<S>(ctx: SkiaContext, data: SnapshotWithSongs<S>, cache: ImageCache): Promise<OverlayRect> {
  const TROPHY_FONT_SIZE = 18, NAME_FONT_SIZE = 28;
  const PROFILE_IMG_RIGHT_MARGIN = 28;
  const TROPHY_BOTTOM_MARGIN = 20;

  // Render header background elements
  await renderHeaderBackground(ctx, data, cache);

  // Render profile image
  const profileImg = await loadImageWithCache(cache, data.snapshot.iconUrl);
  const profileScale = TARGET_HEIGHT / profileImg.height;
  const profileWidth = profileImg.width * profileScale;
  ctx.drawImage(profileImg, PADDING, PADDING, profileWidth, TARGET_HEIGHT);

  // Render trophy background
  const trophyBackground = await loadImageWithCache(cache, '/res/trophy/normal.png');
  const trophyScale = 1.6;
  const trophyWidth = trophyBackground.width * trophyScale;
  const trophyHeight = trophyBackground.height * trophyScale;
  const trophyLeft = PADDING + PROFILE_IMG_RIGHT_MARGIN + profileWidth;
  const trophyTop = PADDING;
  ctx.drawImage(trophyBackground, trophyLeft, trophyTop, trophyWidth, trophyHeight);

  // Render trophy text with stroke
  ctx.font = `450 ${TROPHY_FONT_SIZE}px ${FONT_FAMILY}`;
  const trophyTextWidth = measureTextWidth(ctx, data.snapshot.title);
  const trophyTextLeft = trophyLeft + trophyWidth / 2 - trophyTextWidth / 2;
  const trophyTextTop = trophyTop + trophyHeight / 2 - TROPHY_FONT_SIZE / 2 - 2;

  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 4;
  ctx.strokeText(data.snapshot.title, trophyTextLeft, trophyTextTop + TROPHY_FONT_SIZE);
  ctx.fillStyle = 'white';
  ctx.fillText(data.snapshot.title, trophyTextLeft, trophyTextTop + TROPHY_FONT_SIZE);

  // Render name rect
  const nameRectWidth = trophyWidth;
  const nameRectHeight = trophyHeight + NAME_FONT_SIZE;
  const nameRectLeft = trophyLeft;
  const nameRectTop = trophyTop + trophyHeight + TROPHY_BOTTOM_MARGIN;

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = 'black';
  roundRect(ctx, nameRectLeft, nameRectTop, nameRectWidth, nameRectHeight, 10);
  ctx.fill();
  ctx.restore();

  // Render name text
  ctx.font = `700 ${NAME_FONT_SIZE}px ${FONT_FAMILY}`;
  const nameTextWidth = measureTextWidth(ctx, data.snapshot.displayName);
  const nameTextLeft = nameRectLeft + trophyWidth / 2 - nameTextWidth / 2;
  const nameTextTop = nameRectTop + nameRectHeight / 2 - NAME_FONT_SIZE / 2;

  ctx.fillStyle = '#f9f0f4';
  ctx.fillText(data.snapshot.displayName, nameTextLeft, nameTextTop + NAME_FONT_SIZE / 2 + 10);

  // Render rating frame
  const ratingFrame = await loadImageWithCache(cache, getRatingImageUrl(data.snapshot.rating));
  const ratingScale = 0.75;
  const ratingWidth = ratingFrame.width * ratingScale;
  const ratingHeight = ratingFrame.height * ratingScale;
  const ratingLeft = nameRectLeft - 2;
  const ratingTop = nameRectTop + nameRectHeight + TROPHY_BOTTOM_MARGIN - 2;
  ctx.drawImage(ratingFrame, ratingLeft, ratingTop, ratingWidth, ratingHeight);

  // Render rating digits
  ctx.font = `600 ${ratingHeight * 0.53}px ${FONT_FAMILY_MONO}`;
  ctx.fillStyle = '#f9f0f4';
  let digitLeft = ratingLeft + ratingWidth * 0.43;
  for (const char of data.snapshot.rating.toString()) {
    ctx.fillText(char, digitLeft, ratingTop + ratingHeight * 0.19 + ratingHeight * 0.53);
    digitLeft += 23;
  }

  // Render class rank
  const classRankImg = await loadImageWithCache(cache, data.snapshot.classRankUrl);
  const classRankScale = 0.7;
  const classRankWidth = classRankImg.width * classRankScale;
  const classRankHeight = classRankImg.height * classRankScale;
  const classRankLeft = ratingLeft + ratingWidth + 10;
  const classRankTop = ratingTop + ratingHeight / 2 - classRankHeight / 2;
  ctx.drawImage(classRankImg, classRankLeft, classRankTop, classRankWidth, classRankHeight);

  // Render course rank
  const courseRankImg = await loadImageWithCache(cache, data.snapshot.courseRankUrl);
  const courseRankScale = 0.6;
  const courseRankWidth = courseRankImg.width * courseRankScale;
  const courseRankHeight = courseRankImg.height * courseRankScale;
  const courseRankLeft = classRankLeft + classRankWidth + 10;
  const courseRankTop = ratingTop + ratingHeight / 2 - courseRankHeight / 2;
  ctx.drawImage(courseRankImg, courseRankLeft, courseRankTop, courseRankWidth, courseRankHeight);

  // Render dark overlay
  const overlayTop = TARGET_HEIGHT + PADDING * 2;
  const gradient = ctx.createLinearGradient(0, CANVAS_HEIGHT, 0, 0);
  const contentBackgroundColor = VERSION_SETTINGS[data.snapshot.gameVersion as keyof typeof VERSION_SETTINGS]?.contentBackgroundColor || '#00000010';
  gradient.addColorStop(1, contentBackgroundColor);
  gradient.addColorStop(0, contentBackgroundColor);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, overlayTop, CANVAS_WIDTH, CANVAS_HEIGHT - overlayTop);

  return {
    left: PADDING,
    top: overlayTop,
    width: CANVAS_WIDTH - PADDING * 2,
    height: CANVAS_HEIGHT - TARGET_HEIGHT - PADDING * 3,
  };
}

const SONG_OUTER_PADDING = 0
const SONG_PADDING = 16

async function renderSong<S extends SongForRender>(
  ctx: SkiaContext,
  cache: ImageCache,
  gameVersion: number,
  overlayRect: OverlayRect,
  song: S & { rating: number },
  index: number,
  yOffset: number
) {
  const difficultyColor = song.difficulty === "basic" ? "green" :
    song.difficulty === "advanced" ? "yellow" :
      song.difficulty === "expert" ? "#ed5e65" :
        song.difficulty === "master" ? "#af5eed" :
          song.difficulty === "remaster" ? "#E8D4FF" :
            song.difficulty === "utage" ? "pink" :
              "white";

  const img = await loadImageWithCache(cache, song.cover);

  const imgWidth = (overlayRect.width - SONG_OUTER_PADDING * 2 - SONG_PADDING * 4) / 5;
  const requiredHeight = imgWidth / 16 * 11;
  const imgScale = imgWidth / img.width;

  const imgTop = overlayRect.top + SONG_OUTER_PADDING + yOffset + Math.floor(index / 5) * (requiredHeight + 2 + SONG_PADDING);
  const imgLeft = overlayRect.left + SONG_OUTER_PADDING + (index % 5) * (imgWidth + SONG_PADDING);

  const realBounds = {
    top: imgTop,
    left: imgLeft,
    width: imgWidth,
    height: requiredHeight,
  };

  const imgHeight = img.height * imgScale;
  const imgDrawTop = imgTop - (imgHeight - requiredHeight) * 0.75;

  // Draw image with clipping
  ctx.save();
  roundRect(ctx, imgLeft, imgTop, imgWidth, requiredHeight, 10);
  ctx.clip();
  ctx.drawImage(img, imgLeft - 4, imgDrawTop - 4, imgWidth + 8, imgHeight + 8);
  ctx.restore();

  // Draw cover gradient with stroke and shadow
  ctx.save();
  ctx.shadowColor = '#00000026';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  const coverGradient = ctx.createLinearGradient(0, realBounds.top + realBounds.height, 0, realBounds.top);
  coverGradient.addColorStop(0, '#0000003C');
  coverGradient.addColorStop(0.5, '#00000029');
  coverGradient.addColorStop(1, '#0000001C');

  ctx.fillStyle = coverGradient;
  ctx.strokeStyle = difficultyColor;
  ctx.lineWidth = 4;
  roundRect(ctx, realBounds.left, realBounds.top, realBounds.width, realBounds.height, 10);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Draw info background gradient
  const infoHeight = 70;
  const infoGradient = ctx.createLinearGradient(0, realBounds.top + realBounds.height, 0, realBounds.top + realBounds.height - infoHeight);
  infoGradient.addColorStop(0, '#00000060');
  infoGradient.addColorStop(1, '#00000000');

  ctx.save();
  ctx.globalAlpha = 0.3;
  roundRect(ctx, realBounds.left, realBounds.top, realBounds.width, realBounds.height, 10);
  ctx.clip();
  ctx.fillStyle = infoGradient;
  ctx.fillRect(realBounds.left, realBounds.top + realBounds.height - infoHeight, realBounds.width, infoHeight);
  ctx.restore();

  // Draw song name with shadow and clipping
  ctx.save();
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 4;
  ctx.font = `700 18px ${FONT_FAMILY}`;
  ctx.fillStyle = '#f5f5f5';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  roundRect(ctx, realBounds.left + 2, realBounds.top + 2, realBounds.width - 14, realBounds.height - 14, 0);
  ctx.clip();
  ctx.fillText(song.songName, realBounds.left + 12, realBounds.top + realBounds.height - 16 - 12 - 11);
  // more shadow
  ctx.shadowColor = '#00000030';
  ctx.fillText(song.songName, realBounds.left + 12, realBounds.top + realBounds.height - 16 - 12 - 11);
  ctx.restore();

  // Draw achievement text with shadow
  ctx.save();
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.font = `550 16px ${FONT_FAMILY_MONO}`;
  ctx.fillStyle = '#f5f5f5';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  const achievementText = (song.achievement / 10000).toFixed(4) + '%';
  ctx.fillText(achievementText, realBounds.left + 12, realBounds.top + realBounds.height - 14);
  // more shadow
  ctx.shadowColor = '#00000030';
  ctx.fillText(achievementText, realBounds.left + 12, realBounds.top + realBounds.height - 14);
  ctx.restore();

  // Draw rating text with shadow
  ctx.save();
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.font = `600 26px ${FONT_FAMILY_MONO}`;
  ctx.fillStyle = '#f5f5f5';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(song.rating.toString(), realBounds.left + realBounds.width - 10, realBounds.top + realBounds.height - 8);
  ctx.restore();

  // Draw difficulty badge background
  ctx.save();
  ctx.font = `500 14px ${FONT_FAMILY_MONO}`;
  const diffText = (song.levelPrecise / 10).toFixed(1);
  const diffTextWidth = ctx.measureText(diffText).width;

  ctx.fillStyle = difficultyColor;
  roundRect(ctx, realBounds.left, realBounds.top, realBounds.width, realBounds.height, 10);
  ctx.clip();
  roundRect(ctx, realBounds.left + realBounds.width - diffTextWidth - 20, realBounds.top - 10, diffTextWidth + 20 + 10, 24 + 10, 10);
  ctx.fill();
  ctx.restore();

  // Draw difficulty text
  ctx.save();
  ctx.font = `500 14px ${FONT_FAMILY_MONO}`;
  ctx.fillStyle = song.difficulty === "remaster" ? "#591a8b" : "#f2f2f2";
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(diffText, realBounds.left + realBounds.width - 10, realBounds.top + 3);
  ctx.restore();

  // Draw song type badge
  const songTypeBadgeUrl = song.type === "dx"
    ? "https://maimaidx.jp/maimai-mobile/img/music_dx.png"
    : "https://maimaidx.jp/maimai-mobile/img/music_standard.png";
  const songTypeBadge = await loadImageWithCache(cache, songTypeBadgeUrl);
  const badgeScale = 0.45;
  ctx.drawImage(
    songTypeBadge,
    realBounds.left + 12,
    realBounds.top + 12,
    songTypeBadge.width * badgeScale,
    songTypeBadge.height * badgeScale
  );

  // Draw FC and FS badges
  const fcBadgeUrl = `/res/badge/${gameVersion}/${song.fc}.png`;
  const fsBadgeUrl = `/res/badge/${gameVersion}/${song.fs}.png`;
  const fcBadge = await loadImageWithCache(cache, fcBadgeUrl);
  const fsBadge = await loadImageWithCache(cache, fsBadgeUrl);
  const fcfsBadgeScale = 0.6;
  const fcfsStartX = realBounds.left + 10; // realBounds.left + realBounds.width - fcBadge.width * fcfsBadgeScale - fsBadge.width * fcfsBadgeScale - 3 - 1;
  const fcfsStartY = realBounds.top + 52;
  ctx.drawImage(
    fcBadge,
    fcfsStartX,
    fcfsStartY,
    fcBadge.width * fcfsBadgeScale,
    fcBadge.height * fcfsBadgeScale
  );
  ctx.drawImage(
    fsBadge,
    fcfsStartX + fcBadge.width * fcfsBadgeScale - 1,
    fcfsStartY,
    fsBadge.width * fcfsBadgeScale,
    fsBadge.height * fcfsBadgeScale
  );
}

async function renderContent<S extends SongForRender>(
  ctx: SkiaContext,
  data: SnapshotWithSongs<S>,
  cache: ImageCache,
  overlayRect: OverlayRect
) {
  const { newSongsB15, oldSongsB35 } = splitSongs(data.songs, data.snapshot.gameVersion);

  // Render new songs (B15)
  for (let i = 0; i < newSongsB15.length; i++) {
    await renderSong(ctx, cache, data.snapshot.gameVersion, overlayRect, newSongsB15[i], i, 60);
  }

  // Render old songs (B35)
  for (let i = 0; i < oldSongsB35.length; i++) {
    await renderSong(ctx, cache, data.snapshot.gameVersion, overlayRect, oldSongsB35[i], i + 15, 110);
  }

  await renderSongsLabel(ctx, cache, overlayRect, true, 24);
  await renderSongsLabel(ctx, cache, overlayRect, false, 566);
}

async function renderSongsLabel(
  ctx: SkiaContext,
  cache: ImageCache,
  overlayRect: OverlayRect,
  newSongs: boolean,
  yOffset: number
) {
  const labelUrl = newSongs ? "/res/label/new.png" : "/res/label/old.png";
  const label = await loadImageWithCache(cache, labelUrl);
  const labelScale = 0.26;
  const labelWidth = label.width * labelScale;
  const labelHeight = label.height * labelScale;

  ctx.save();
  ctx.globalAlpha = 0.98;
  ctx.shadowColor = '#00000010';
  ctx.shadowBlur = 30;
  ctx.drawImage(label, overlayRect.left + 2, overlayRect.top + yOffset, labelWidth, labelHeight);
  ctx.restore();
}

async function renderFooter<S>(ctx: SkiaContext, data: SnapshotWithSongs<S>, visitableProfileAt: string | null) {
  const footerHeight = 50;
  const footerTop = CANVAS_HEIGHT - footerHeight;

  // Draw footer background
  ctx.fillStyle = VERSION_SETTINGS[data.snapshot.gameVersion as keyof typeof VERSION_SETTINGS]?.footerBackgroundColor || '#00000020';
  ctx.fillRect(0, footerTop, CANVAS_WIDTH, footerHeight);

  // Draw footer text
  const footerText = visitableProfileAt
    ? `Visit my profile at https://tomomai.lol/profile/${visitableProfileAt}/`
    : "Generated with https://tomomai.lol/";

  ctx.save();
  ctx.globalAlpha = 0.86;
  ctx.font = `500 16px ${FONT_FAMILY}`;
  ctx.fillStyle = '#f9f0f4';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(footerText, 15, footerTop + 15);
  ctx.restore();

  // Draw date text
  const dateText = "at " + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  ctx.save();
  ctx.globalAlpha = 0.86;
  ctx.font = `400 16px ${FONT_FAMILY}`;
  ctx.fillStyle = '#f9f0f4';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(dateText, CANVAS_WIDTH - 15, footerTop + 15);
  ctx.restore();
}
