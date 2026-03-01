import { CreditData, RecentSongData, SnapshotMetadata } from '@/server/services/credit-data';
import type { CanvasRenderingContext2D as SkiaContext } from 'skia-canvas';
import { Canvas, Image, loadImage } from 'skia-canvas';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './image-spec';
import { getRatingImageUrl, RatingCalculationInput, splitSongs } from "./rating-calculator";
import { calculateDXStars, calculateNoteLosses, distributeBreaks } from './score-details';
import type { Difficulty, FullCombo, FullSync, SongType, TitleType } from "./types";
import { SnapshotWithSongs } from "./types";
import { getTypeBadgeUrl } from "./utils";

type CanvasSize = {
  width: number;
  height: number;
}

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
  const canvasSize = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
  const canvas = new Canvas(canvasSize.width, canvasSize.height);
  const ctx = canvas.getContext('2d') as SkiaContext;

  await renderBackground(ctx, data.snapshot.gameVersion, false, cache, canvasSize);
  const overlayRect = await renderHeader(ctx, data.snapshot, cache, canvasSize);
  await renderContent(ctx, data, cache, overlayRect);
  const footerText = visitableProfileAt
    ? `Visit my profile at https://tomomai.lol/profile/${visitableProfileAt}/`
    : "Generated with https://tomomai.lol/";
  await renderFooter(ctx, data.snapshot.gameVersion, footerText, canvasSize);

  return canvas;
}

export async function renderLastCreditImage(data: CreditData, snapshot: SnapshotMetadata, cache: ImageCache): Promise<Canvas> {
  const long = data.tracks.length >= 4;
  const canvasSize = { width: CANVAS_WIDTH, height: !long ? 2420 : 3100 };
  const canvas = new Canvas(canvasSize.width, canvasSize.height);
  const ctx = canvas.getContext('2d') as SkiaContext;

  await renderBackground(ctx, snapshot.gameVersion, true, cache, canvasSize);
  const overlayRect = await renderHeader(ctx, snapshot, cache, canvasSize);
  await renderLastCreditContent(ctx, data, cache, overlayRect);
  const footerText = `Recent credit at ${data.playedAt.toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })}, generated with https://tomomai.lol/`;
  await renderFooter(ctx, snapshot.gameVersion, footerText, canvasSize);

  return canvas;
}

async function renderBackground(ctx: SkiaContext, gameVersion: number, long: boolean, cache: ImageCache, canvas: CanvasSize) {
  const backgroundImg = await loadImageWithCache(cache, `/res/bg/${gameVersion}${long ? '_long' : ''}.png`);
  ctx.drawImage(backgroundImg, 0, 0, canvas.width * 2, canvas.height * 2, 0, 0, canvas.width, canvas.height);
}

async function renderHeaderBackground(
  ctx: SkiaContext,
  data: HeaderData,
  cache: ImageCache,
) {
  const INNER_PADDING = 30;

  // Render character with clipping
  const characterSettings = VERSION_SETTINGS[data.gameVersion as keyof typeof VERSION_SETTINGS]?.character || {
    scaleX: 0.56,
    scaleY: 0.56,
    left: CANVAS_WIDTH - 580,
    top: -100,
    opacity: 0.9,
  };
  const characterImg = await loadImageWithCache(cache, `/res/character/${data.gameVersion}.png`);

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
  const logoImg = await loadImageWithCache(cache, `/res/logo/${data.gameVersion}.png`);
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

type HeaderData = {
  displayName: string;
  iconUrl: string;
  title: string;
  titleType: TitleType;
  rating: number;
  classRankUrl: string;
  courseRankUrl: string;
  gameVersion: number;
};

async function renderHeader(ctx: SkiaContext, data: HeaderData, cache: ImageCache, canvas: CanvasSize): Promise<OverlayRect> {
  const TROPHY_FONT_SIZE = 18, NAME_FONT_SIZE = 28;
  const PROFILE_IMG_RIGHT_MARGIN = 28;
  const TROPHY_BOTTOM_MARGIN = 20;

  // Render header background elements
  await renderHeaderBackground(ctx, data, cache);

  // Render profile image
  const profileImg = await loadImageWithCache(cache, data.iconUrl);
  const profileScale = TARGET_HEIGHT / profileImg.height;
  const profileWidth = profileImg.width * profileScale;
  ctx.drawImage(profileImg, PADDING, PADDING, profileWidth, TARGET_HEIGHT);

  // Render trophy background
  const trophyBackground = await loadImageWithCache(cache, `/res/trophy/${data.titleType}.png`);
  const trophyScale = 1.6;
  const trophyWidth = trophyBackground.width * trophyScale;
  const trophyHeight = trophyBackground.height * trophyScale;
  const trophyLeft = PADDING + PROFILE_IMG_RIGHT_MARGIN + profileWidth;
  const trophyTop = PADDING;
  ctx.drawImage(trophyBackground, trophyLeft, trophyTop, trophyWidth, trophyHeight);

  // Render trophy text with stroke
  ctx.font = `450 ${TROPHY_FONT_SIZE}px ${FONT_FAMILY}`;
  const trophyTextWidth = measureTextWidth(ctx, data.title);
  const trophyTextLeft = trophyLeft + trophyWidth / 2 - trophyTextWidth / 2;
  const trophyTextTop = trophyTop + trophyHeight / 2 - TROPHY_FONT_SIZE / 2 - 2;

  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 4;
  ctx.strokeText(data.title, trophyTextLeft, trophyTextTop + TROPHY_FONT_SIZE);
  ctx.fillStyle = 'white';
  ctx.fillText(data.title, trophyTextLeft, trophyTextTop + TROPHY_FONT_SIZE);

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
  const nameTextWidth = measureTextWidth(ctx, data.displayName);
  const nameTextLeft = nameRectLeft + trophyWidth / 2 - nameTextWidth / 2;
  const nameTextTop = nameRectTop + nameRectHeight / 2 - NAME_FONT_SIZE / 2;

  ctx.fillStyle = '#f9f0f4';
  ctx.fillText(data.displayName, nameTextLeft, nameTextTop + NAME_FONT_SIZE / 2 + 10);

  // Render rating frame
  const ratingFrame = await loadImageWithCache(cache, getRatingImageUrl(data.rating));
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
  for (const char of data.rating.toString()) {
    ctx.fillText(char, digitLeft, ratingTop + ratingHeight * 0.19 + ratingHeight * 0.53);
    digitLeft += 23;
  }

  // Render class rank
  const classRankImg = await loadImageWithCache(cache, data.classRankUrl);
  const classRankScale = 0.7;
  const classRankWidth = classRankImg.width * classRankScale;
  const classRankHeight = classRankImg.height * classRankScale;
  const classRankLeft = ratingLeft + ratingWidth + 10;
  const classRankTop = ratingTop + ratingHeight / 2 - classRankHeight / 2;
  ctx.drawImage(classRankImg, classRankLeft, classRankTop, classRankWidth, classRankHeight);

  // Render course rank
  const courseRankImg = await loadImageWithCache(cache, data.courseRankUrl);
  const courseRankScale = 0.6;
  const courseRankWidth = courseRankImg.width * courseRankScale;
  const courseRankHeight = courseRankImg.height * courseRankScale;
  const courseRankLeft = classRankLeft + classRankWidth + 10;
  const courseRankTop = ratingTop + ratingHeight / 2 - courseRankHeight / 2;
  ctx.drawImage(courseRankImg, courseRankLeft, courseRankTop, courseRankWidth, courseRankHeight);

  // Render dark overlay
  const overlayTop = TARGET_HEIGHT + PADDING * 2;
  const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
  const contentBackgroundColor = VERSION_SETTINGS[data.gameVersion as keyof typeof VERSION_SETTINGS]?.contentBackgroundColor || '#00000010';
  gradient.addColorStop(1, contentBackgroundColor);
  gradient.addColorStop(0, contentBackgroundColor);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, overlayTop, canvas.width, canvas.height - overlayTop);

  return {
    left: PADDING,
    top: overlayTop,
    width: canvas.width - PADDING * 2,
    height: canvas.height - TARGET_HEIGHT - PADDING * 3,
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
  const songTypeBadge = await loadImageWithCache(cache, getTypeBadgeUrl(song.type));
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

async function renderLastCreditContent(
  ctx: SkiaContext,
  data: CreditData,
  cache: ImageCache,
  overlayRect: OverlayRect
) {
  for (let i = 0; i < data.tracks.length; i++) {
    await renderTrack(ctx, cache, overlayRect, data.tracks[i], i,
      data.tracks.length, data.tracks.length <= 2 ? 1.0 : 0.84);
  }
}

async function renderTrack(
  ctx: SkiaContext,
  cache: ImageCache,
  overlayRect: OverlayRect,
  track: RecentSongData,
  index: number,
  trackCount: number,
  overallScale: number
) {
  const trackImage = await loadImageWithCache(cache, `/res/songs/track_${index == 0 ? '1' : index == trackCount - 1 ? '3' : '2'}.png`);
  const base = await loadImageWithCache(cache, `/res/songs/song_${track.difficulty}.png`);
  const jacket = await loadImageWithCache(cache, `/res/songs/music_jacket_${track.difficulty}.png`);
  const baseScale = 1.0 * overallScale;
  const baseWidth = base.width * baseScale;
  const baseHeight = base.height * baseScale;
  const jacketScale = 1.0 * overallScale;
  const jacketWidth = jacket.width * jacketScale;
  const jacketHeight = jacket.height * jacketScale;
  const trackImageScale = 1.25 * overallScale;

  const xOffset = 0, yOffset = 0;
  const yPad = (trackCount === 4 ? 60 : 70) * overallScale;
  const xGap = 10, yGap = 520 * overallScale;
  const totalWidth = jacketWidth + xGap + baseWidth;

  const leftStart = overlayRect.left + overlayRect.width / 2 - totalWidth / 2 + xOffset;
  let topStart = overlayRect.top + yPad + (baseHeight + yGap) * index + yOffset;
  const baseLeftStart = leftStart + jacketWidth + xGap;
  let bottomTopStart = topStart + baseHeight + 10;

  const renderTrack = async () => {
    const trackImageXOffset = 16 * overallScale;
    // track image
    ctx.drawImage(trackImage, leftStart + trackImageXOffset + totalWidth - trackImage.width * trackImageScale, topStart, trackImage.width * trackImageScale, trackImage.height * trackImageScale);
    ctx.drawImage(trackImage, trackImage.width * 0.8, 0, trackImage.width * 0.2, trackImage.height, leftStart + trackImageXOffset + totalWidth, topStart, 1000, trackImage.height * trackImageScale);
    // render text on track image
    renderScoreText(ctx, cache, "/res/numbers/score_num_count_big.png", (index + 1).toString(), leftStart + trackImageXOffset + totalWidth - trackImage.width * trackImageScale * 0.37, topStart + trackImage.height * trackImageScale * 0.08, 0.47 * trackImageScale,
      index === 0 ? "#4691F7" : index === trackCount - 1 ? "#FE5134" : "#5EC724", "#FFFFFF", 2);
    renderScoreText(ctx, cache, "/res/numbers/score_num_count.png", trackCount.toString(), leftStart + trackImageXOffset + totalWidth - trackImage.width * trackImageScale * 0.21, topStart + trackImage.height * trackImageScale * 0.2, 0.54 * trackImageScale,
      index === 0 ? "#4691F7" : index === trackCount - 1 ? "#FE5134" : "#5EC724", "#FFFFFF", 2);

    topStart += trackImage.height * trackImageScale + 10;
    bottomTopStart += trackImage.height * trackImageScale + 10;

    ctx.drawImage(jacket, leftStart, topStart, jacketWidth, jacketHeight);
    ctx.drawImage(base, baseLeftStart, topStart, baseWidth, baseHeight);
  };

  const renderCover = async () => {
    // cover needs to scale to 214/288 of the size of the jacket
    const cover = await loadImageWithCache(cache, track.cover);
    const coverWidth = jacketWidth * 214 / jacket.width;
    const coverHeight = jacketHeight * 214 / jacket.height;

    ctx.drawImage(cover, (leftStart + jacketWidth * 35 / jacket.width), topStart + jacketHeight * 38 / jacket.height, coverWidth, coverHeight);
  };

  const renderSongName = async () => {
    ctx.save();
    ctx.font = `600 ${(jacketScale * 24).toFixed(0)}px "FOT-NewRodin Pro"`;
    ctx.fillStyle = "#FFFFFF";
    const songNameWidth = ctx.measureText(track.songName).width;
    ctx.fillText(track.songName, baseLeftStart + baseWidth / 2 - songNameWidth / 2, topStart + baseHeight * 0.46);
    ctx.restore();
  };

  const renderAchievement = async () => {
    // Format achievement as xxx.xxxx
    const achievementText = (track.achievement / 10000).toFixed(4).toString();
    const bigColor = track.achievement >= 970000 ? "big_gold" : track.achievement >= 800000 ? "big_red" : "big_blue";
    const color = track.achievement >= 970000 ? "gold" : track.achievement >= 800000 ? "red" : "blue";
    const { width: achievementBigWidth, height: achievementBigHeight } = await getScoreTextSize(cache, `/res/numbers/score_${bigColor}.png`);
    const { width: achievementWidth, height: achievementHeight } = await getScoreTextSize(cache, `/res/numbers/score_${color}.png`);
    const percentage = await loadImageWithCache(cache, `/res/numbers/percentage_${color}.png`);
    const percentageScale = 0.7 * baseScale;
    const bigAchievementScale = 0.7 * baseScale;
    const nonNumberScale = 0.7 * baseScale;
    const achievementDigitsScale = 0.7 * baseScale;
    const bigAchievementXSpread = -6, achievementXSpread = -12;
    const specialX = {
      ".": -10,
      "1": -4,
    }
    const specialXSpread = {
      ".": -37,
      "1": -14,
    }

    const totalAchievementWidth = (() => {
      let width = 0;
      let passedDot = false;
      for (const char of achievementText) {
        const scale = char === "." ? nonNumberScale : passedDot ? achievementDigitsScale : bigAchievementScale;
        if (!isNaN(Number(char))) {
          width += (!passedDot ? achievementBigWidth * scale + bigAchievementXSpread * scale : achievementWidth * scale + achievementXSpread * scale);
        } else {
          width += achievementWidth * scale;
          passedDot = true;
        }
        width += (specialXSpread[char as keyof typeof specialXSpread] || 0) * scale;
      }
      return width;
    })() + percentage.width * percentageScale;

    let achievementX = baseLeftStart + baseWidth / 2 - totalAchievementWidth / 2;
    let achievementY = topStart + baseHeight * 0.62;
    let passedDot = false;
    for (const [i, char] of achievementText.split("").entries()) {
      passedDot = char === "." || passedDot;
      const toDraw = passedDot ? color : bigColor;
      const scale = char === "." ? nonNumberScale : passedDot ? achievementDigitsScale : bigAchievementScale;
      const toDrawX = achievementX + (specialX[char as keyof typeof specialX] || 0);
      const toDrawY = achievementY + achievementBigHeight * bigAchievementScale - (passedDot ? achievementHeight : achievementBigHeight) * scale - (passedDot && char !== "." ? 10 : 0) * scale;
      renderScoreText(ctx, cache, `/res/numbers/score_${toDraw}.png`, char, toDrawX, toDrawY, scale);
      achievementX += char === "." ? achievementWidth * nonNumberScale : (!passedDot ? achievementBigWidth * bigAchievementScale + bigAchievementXSpread * scale : achievementWidth * achievementDigitsScale + achievementXSpread * scale);
      achievementX += (specialXSpread[char as keyof typeof specialXSpread] || 0) * scale;
    }

    ctx.drawImage(percentage, achievementX, achievementY + achievementBigHeight * bigAchievementScale - percentage.height * percentageScale * 1.45, percentage.width * percentageScale, percentage.height * percentageScale);
  };

  const renderType = async () => {
    // Draw type
    const type = await loadImageWithCache(cache, getTypeBadgeUrl(track.type));
    const typeScale = 0.9 * baseScale;
    ctx.drawImage(type, baseLeftStart + baseWidth * 0.63, topStart + baseHeight * 0.22, type.width * typeScale, type.height * typeScale);
  }

  const renderLevel = async () => {
    const color = `/res/numbers/level_${track.difficulty}.png`;
    renderScoreText(ctx, cache, color, "lv",
      baseLeftStart + baseWidth * 0.78, topStart + baseHeight * 0.15, 1.0 * baseScale);

    const levelToRender = track.level;
    let x = baseLeftStart + baseWidth * 0.83, y = topStart + baseHeight * 0.15;
    if (levelToRender[0] !== "1") x += baseWidth * 0.008;
    for (const char of levelToRender.split("")) {
      renderScoreText(ctx, cache, color, char,
        x - (char === "+" ? baseWidth * 0.01 : 0), y - (char === "+" ? baseHeight * 0.02 : 0), 1.0 * baseScale);
      if (levelToRender.length > 1 && char !== "+") {
        x += baseWidth * 0.041;
        if (char !== "1") x += baseWidth * 0.008;
      }
    }

    {
      const char = ".";
      renderScoreText(ctx, cache, color, char,
        x - baseWidth * 0.02, y + baseHeight * 0.04, 1.0 * baseScale);
    }
    {
      const char = (track.levelPrecise % 10).toString();
      renderScoreText(ctx, cache, color, char,
        x + baseWidth * (char === "1" ? 0.0155 - 0.005 : 0.0155), y + baseHeight * 0.055, 0.7 * baseScale);
    }
  };

  const renderTable = async () => {
    // Draw table
    const bottomXOffset = xGap;
    const table = await loadImageWithCache(cache, `/res/songs/score_table.png`);
    const tableScale = 1.0 * overallScale;
    ctx.save();
    ctx.shadowColor = '#00000050';
    ctx.shadowBlur = 10;
    if (!track.details) {
      ctx.globalAlpha = 0.7;
    }
    ctx.drawImage(table, leftStart + bottomXOffset, bottomTopStart, table.width * tableScale, table.height * tableScale);
    ctx.restore();
    return {
      tableX: leftStart + bottomXOffset,
      tableY: bottomTopStart,
      tableWidth: table.width * tableScale,
      tableHeight: table.height * tableScale,
      tableScale,
    }
  }

  const renderTableDetails: (props: {
    tableX: number;
    tableY: number;
    tableWidth: number;
    tableHeight: number;
    details: NonNullable<RecentSongData["details"]>;
  }) => Promise<void> = async ({ tableX, tableY, tableWidth, tableHeight, details }) => {
    const notes = {
      tap: {
        criticalPerfect: details.tapCPerfect,
        perfect: details.tapPerfect,
        great: details.tapGreat,
        good: details.tapGood,
        miss: details.tapMiss,
      },
      hold: {
        criticalPerfect: details.holdCPerfect,
        perfect: details.holdPerfect,
        great: details.holdGreat,
        good: details.holdGood,
        miss: details.holdMiss,
      },
      slide: {
        criticalPerfect: details.slideCPerfect,
        perfect: details.slidePerfect,
        great: details.slideGreat,
        good: details.slideGood,
        miss: details.slideMiss,
      },
      touch: {
        criticalPerfect: details.touchCPerfect,
        perfect: details.touchPerfect,
        great: details.touchGreat,
        good: details.touchGood,
        miss: details.touchMiss,
      },
      break: {
        criticalPerfect: details.breakCPerfect,
        perfect: details.breakPerfect,
        great: details.breakGreat,
        good: details.breakGood,
        miss: details.breakMiss,
      },
    };
    const breakDist = distributeBreaks(
      notes,
      track.achievement / 10000,
      details.breakPerfect ?? 0,
      details.breakGreat ?? 0
    );
    const losses = calculateNoteLosses(notes, breakDist);
    const columnColor = [
      "#FFA103",
      "#FF7E24",
      "#F74999",
      "#34B939",
      "#73746F"
    ]
    const matrix: { c: number | string, p?: number }[][] = [
      [{ c: details.tapCPerfect }, { c: details.tapPerfect }, { c: details.tapGreat, p: losses.tap.great }, { c: details.tapGood, p: losses.tap.good }, { c: details.tapMiss, p: losses.tap.miss }],
      [{ c: details.holdCPerfect }, { c: details.holdPerfect }, { c: details.holdGreat, p: losses.hold.great }, { c: details.holdGood, p: losses.hold.good }, { c: details.holdMiss, p: losses.hold.miss }],
      [{ c: details.slideCPerfect }, { c: details.slidePerfect }, { c: details.slideGreat, p: losses.slide.great }, { c: details.slideGood, p: losses.slide.good }, { c: details.slideMiss, p: losses.slide.miss }],
      [{ c: details.touchCPerfect }, { c: details.touchPerfect }, { c: details.touchGreat, p: losses.touch.great }, { c: details.touchGood, p: losses.touch.good }, { c: details.touchMiss, p: losses.touch.miss }],
      [{ c: details.breakCPerfect }, { c: `${breakDist.perfect2550}-${breakDist.perfect2500}`, p: losses.break.perfect }, { c: `${breakDist.great2000}-${breakDist.great1500}-${breakDist.great1250}`, p: losses.break.great }, { c: details.breakGood, p: losses.break.good }, { c: details.breakMiss, p: losses.break.miss }],
    ];
    const cellX = tableX + (124 / 701) * tableWidth;
    const cellY = tableY + (62 / 360) * tableHeight;
    const cellWidth = (113 / 701) * tableWidth;
    const cellHeight = (57 / 360) * tableHeight;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix[i].length; j++) {
        ctx.font = `500 ${24 * tableScale}px ${FONT_FAMILY_MONO}`;
        const item = matrix[i][j];
        ctx.fillStyle = columnColor[j];
        const rowY = cellY + cellHeight * i + cellHeight * (item.p === undefined ? 0.5 : 0.35);
        ctx.fillText(item.c.toString(), cellX + cellWidth * j + cellWidth * 0.9, rowY);
        if (item.p !== undefined) {
          ctx.font = `400 ${18 * tableScale}px ${FONT_FAMILY_MONO}`;
          ctx.fillText(`-${item.p.toFixed(4)}%`, cellX + cellWidth * j + cellWidth * 0.9, rowY + 0.4 * cellHeight);
        }
      }
    }
    ctx.restore();
  }

  const renderFastLate: (props: {
    tableX: number;
    tableY: number;
    tableWidth: number;
    tableHeight: number;
  }) => Promise<{
    fastLateY: number
  }> = async ({ tableX, tableY, tableWidth, tableHeight }) => {
    // Draw fast late
    const fastLate = await loadImageWithCache(cache, `/res/songs/fast_late.png`);
    const fastLateScale = 0.8 * overallScale;
    const fastLateX = tableX + tableWidth + xGap + (totalWidth - xGap * 4 - tableWidth) / 2 - fastLate.width * fastLateScale / 2;
    const fastLateY = tableY + tableHeight - fastLate.height * fastLateScale + 16 * overallScale;
    ctx.save();
    ctx.shadowBlur = 32 * fastLateScale;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    if (!track.details) {
      ctx.globalAlpha = 0.7;
    }
    ctx.drawImage(fastLate, fastLateX, fastLateY, fastLate.width * fastLateScale, fastLate.height * fastLateScale);
    ctx.restore();
    if (track.details) {
      ctx.save();
      ctx.font = `500 ${fastLateScale * 30}px ${FONT_FAMILY_MONO}`;
      ctx.fillStyle = '#1368D4';
      ctx.textAlign = 'right';
      ctx.fillText(track.details.fastCount.toString(), fastLateX + fastLate.width * fastLateScale * 0.6, fastLateY + fastLate.height * fastLateScale * 0.39);
      ctx.fillStyle = '#F8420B';
      ctx.fillText(track.details.lateCount.toString(), fastLateX + fastLate.width * fastLateScale * 0.87, fastLateY + fastLate.height * fastLateScale * 0.82);
      ctx.restore();
    }

    return { fastLateY }
  }

  const renderFCFS: (props: {
    tableX: number;
    tableWidth: number;
    fastLateY: number
  }) => Promise<{
    fcfsY: number;
  }> = async ({ tableX, tableWidth, fastLateY }) => {
    const baseImage = await loadImageWithCache(cache, `/res/icons/base.png`);
    const baseImageScale = 0.8 * overallScale;
    const x = tableX + tableWidth + xGap + (totalWidth - xGap * 4 - tableWidth) / 2 - baseImage.width * baseImageScale / 2;
    const y = fastLateY - 2 * overallScale - baseImage.height * baseImageScale;
    ctx.save();
    ctx.drawImage(baseImage, x, y, baseImage.width * baseImageScale, baseImage.height * baseImageScale);
    ctx.restore();

    const fcConfig: Record<FullCombo, { base: string; text: string } | null> = {
      'none': null,
      'fc': { base: "fc_base", text: "fc" },
      'fc+': { base: "fc_base", text: "fc+" },
      'ap': { base: "ap_base", text: "ap" },
      'ap+': { base: "ap_base", text: "ap+" },
    }
    const fsConfig: Record<FullSync, { base: string; text: string } | null> = {
      'none': null,
      'sync': { base: "sync_base", text: "sync" },
      'fs': { base: "fs_base", text: "fs" },
      'fs+': { base: "fs_base", text: "fs+" },
      'fdx': { base: "fdx_base", text: "fdx" },
      'fdx+': { base: "fdx_base", text: "fdx+" },
    }

    if (fcConfig[track.fc]) {
      const fcImage = await loadImageWithCache(cache, `/res/icons/${fcConfig[track.fc]!.base}.png`);
      const fcText = await loadImageWithCache(cache, `/res/icons/${fcConfig[track.fc]!.text}.png`);
      const drawX = x - fcImage.width * baseImageScale / 2 + baseImage.width * baseImageScale * 0.28;
      const drawY = y - fcImage.height * baseImageScale / 2 + baseImage.height * baseImageScale * 0.43;
      ctx.drawImage(fcImage, drawX, drawY, fcImage.width * baseImageScale, fcImage.height * baseImageScale);
      ctx.drawImage(fcText, drawX + fcImage.width * baseImageScale / 2 - fcText.width * baseImageScale / 2, drawY + fcImage.height * baseImageScale / 2 - fcText.height * baseImageScale / 2, fcText.width * baseImageScale, fcText.height * baseImageScale);
    }

    if (fsConfig[track.fs]) {
      const fsImage = await loadImageWithCache(cache, `/res/icons/${fsConfig[track.fs]!.base}.png`);
      const fsText = await loadImageWithCache(cache, `/res/icons/${fsConfig[track.fs]!.text}.png`);
      const drawX = x - fsImage.width * baseImageScale / 2 + baseImage.width * baseImageScale * 0.69;
      const drawY = y - fsImage.height * baseImageScale / 2 + baseImage.height * baseImageScale * 0.43;
      ctx.drawImage(fsImage, drawX, drawY, fsImage.width * baseImageScale, fsImage.height * baseImageScale);
      ctx.drawImage(fsText, drawX + fsImage.width * baseImageScale / 2 - fsText.width * baseImageScale / 2, drawY + fsImage.height * baseImageScale / 2 - fsText.height * baseImageScale / 2, fsText.width * baseImageScale, fsText.height * baseImageScale);
    }

    return {
      fcfsY: y
    }
  }

  const renderDXScore: (props: {
    tableX: number;
    tableY: number;
    tableWidth: number;
  }) => Promise<void> = async ({ tableX, tableWidth }) => {
    const dxScoreImage = await loadImageWithCache(cache, `/res/songs/dxscore.png`);
    const dxScoreScale = 1.2 * overallScale;
    const x = tableX + tableWidth + xGap + (totalWidth - xGap * 4 - tableWidth) / 2 - dxScoreImage.width * dxScoreScale / 2;
    const y = tableY;
    ctx.drawImage(dxScoreImage, x, y, dxScoreImage.width * dxScoreScale, dxScoreImage.height * dxScoreScale);
    const bigFontSize = dxScoreScale * 20, bigWeight = 500;
    const smallFontSize = dxScoreScale * 16, smallWeight = 500;
    const percentageFontSize = dxScoreScale * 16, percentageWeight = 500;

    ctx.save();
    ctx.font = `${percentageWeight} ${percentageFontSize}px ${FONT_FAMILY_MONO}`;
    const percentageText = `${(track.dxScore / track.maxDxScore * 100).toFixed(2)}%`
    const percentageWidth = ctx.measureText(percentageText).width;
    const gapXBetweenPercentageAndScore = 8 * overallScale;

    ctx.font = `${bigWeight} ${bigFontSize}px ${FONT_FAMILY_MONO}`;
    ctx.fillStyle = '#1368D4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const dxScoreText = track.dxScore.toString();
    const maxDxScoreText = track.maxDxScore.toString();

    const dxScoreWidth = ctx.measureText(dxScoreText).width;

    ctx.font = `${smallWeight} ${smallFontSize}px ${FONT_FAMILY_MONO}`;
    const slashWidth = ctx.measureText('/').width;
    const maxDxScoreWidth = ctx.measureText(maxDxScoreText).width;

    const textTotalWidth = dxScoreWidth + slashWidth + maxDxScoreWidth;
    const centerX = x + (dxScoreImage.width * dxScoreScale - percentageWidth - gapXBetweenPercentageAndScore) / 2;
    const baselineY = y + dxScoreImage.height * dxScoreScale * 0.84;

    let currentX = centerX - textTotalWidth / 2;

    ctx.font = `${percentageWeight} ${percentageFontSize}px ${FONT_FAMILY_MONO}`;
    ctx.fillText(percentageText, x + dxScoreImage.width * dxScoreScale - percentageWidth, baselineY);

    ctx.font = `${bigWeight} ${bigFontSize}px ${FONT_FAMILY_MONO}`;
    ctx.fillText(dxScoreText, currentX + dxScoreWidth / 2, baselineY);
    currentX += dxScoreWidth;

    ctx.font = `${smallWeight} ${smallFontSize}px ${FONT_FAMILY_MONO}`;
    ctx.fillText('/', currentX + slashWidth / 2, baselineY - 1);
    currentX += slashWidth;

    ctx.fillText(maxDxScoreText, currentX + maxDxScoreWidth / 2, baselineY);
    ctx.restore();

    const dxStars = calculateDXStars(track.dxScore, track.maxDxScore);
    if (dxStars > 0) {
      const starImage = dxStars >= 5 ? 3 : dxStars >= 3 ? 2 : 1;
      const dxStarsImage = await loadImageWithCache(cache, `/res/songs/star_${starImage}.png`);
      const dxStarsScale = 1.0 * overallScale;
      const gapX = 6 * dxStarsScale;
      const paddingX = 18 * dxStarsScale, paddingY = 5 * dxStarsScale, marginX = 4 * dxStarsScale, marginY = 8 * dxStarsScale;
      const totalStarsWidth = dxStarsImage.width * dxStarsScale * dxStars + gapX * (dxStars - 1);
      ctx.save();
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = 'white';
      ctx.shadowBlur = 6 * dxStarsScale;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
      const roundRectHeight = dxStarsImage.height * dxStarsScale + paddingY * 2;
      roundRect(ctx, x + dxScoreImage.width * dxScoreScale / 2 - totalStarsWidth / 2 - paddingX, y + dxScoreImage.height * dxScoreScale + marginY, totalStarsWidth + paddingX * 2, roundRectHeight, roundRectHeight / 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.shadowBlur = 8 * dxStarsScale;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
      for (let i = 0; i < dxStars; i++) {
        ctx.drawImage(dxStarsImage, x + dxScoreImage.width * dxScoreScale / 2 - totalStarsWidth / 2 + i * (dxStarsImage.width * dxStarsScale + gapX), y + dxScoreImage.height * dxScoreScale + paddingY + marginY, dxStarsImage.width * dxStarsScale, dxStarsImage.height * dxStarsScale);
      }
      ctx.restore();
    }
  }

  await renderTrack();
  await renderCover();
  await renderSongName();
  await renderType();
  await renderLevel();
  await renderAchievement();
  const { tableX, tableY, tableWidth, tableHeight, tableScale } = await renderTable();

  // Draw stats
  if (track.details) {
    await renderTableDetails({ tableX, tableY, tableWidth, tableHeight, details: track.details });
  }

  const { fastLateY } = await renderFastLate({ tableX, tableY, tableWidth, tableHeight });
  const { fcfsY } = await renderFCFS({ tableX, tableWidth, fastLateY });
  await renderDXScore({ tableX, tableY, tableWidth });
}

async function getScoreTextSize(cache: ImageCache, color: string) {
  const numberImg = await loadImageWithCache(cache, color);
  return { width: numberImg.width / 4, height: numberImg.height / 3 };
}

async function renderScoreText(
  ctx: SkiaContext,
  cache: ImageCache,
  color: string,
  text: string,
  x: number,
  y: number,
  scale: number,
  tintColor?: string,
  borderColor?: string,
  borderWidth: number = 2,
) {
  const numberImg = await loadImageWithCache(cache, color);
  const textSlots = {
    "0": [0, 0],
    "1": [1, 0],
    "2": [2, 0],
    "3": [3, 0],
    "4": [0, 1],
    "5": [1, 1],
    "6": [2, 1],
    "7": [3, 1],
    "8": [0, 2],
    "9": [1, 2],
    "+": [2, 2],
    "-": [3, 2],
    ",": [0, 3],
    ".": [1, 3],
    "lv": [2, 3],
  }

  // get the section
  const section = textSlots[text as keyof typeof textSlots];
  if (!section) return;

  const [xSubsection, ySubsection] = section;
  const wSection = numberImg.width / 4;
  const hSection = numberImg.height / 4;

  if (tintColor || borderColor) {
    // Create a temporary canvas for the tinting/border operation
    const padding = borderColor ? borderWidth : 0;
    const tempCanvas = new Canvas(wSection * scale + padding * 2, hSection * scale + padding * 2);
    const tempCtx = tempCanvas.getContext('2d') as SkiaContext;

    // Draw border if specified
    if (borderColor) {
      // Create a separate canvas for the border
      const borderCanvas = new Canvas(wSection * scale + padding * 2, hSection * scale + padding * 2);
      const borderCtx = borderCanvas.getContext('2d') as SkiaContext;

      // Draw the border by drawing the image multiple times offset in different directions
      const offsets = [];
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        offsets.push({
          x: Math.cos(angle) * borderWidth,
          y: Math.sin(angle) * borderWidth
        });
      }

      borderCtx.globalCompositeOperation = 'source-over';
      for (const offset of offsets) {
        borderCtx.drawImage(
          numberImg,
          wSection * xSubsection,
          hSection * ySubsection,
          wSection,
          hSection,
          padding + offset.x,
          padding + offset.y,
          wSection * scale,
          hSection * scale
        );
      }

      // Fill the border with the border color
      borderCtx.globalCompositeOperation = 'source-in';
      borderCtx.fillStyle = borderColor;
      borderCtx.fillRect(0, 0, borderCanvas.width, borderCanvas.height);

      // Draw the border to the main temp canvas
      tempCtx.drawImage(borderCanvas, 0, 0);
    }

    // Create a separate canvas for the main text
    const textCanvas = new Canvas(wSection * scale, hSection * scale);
    const textCtx = textCanvas.getContext('2d') as SkiaContext;

    // Draw the main image
    textCtx.drawImage(numberImg, wSection * xSubsection, hSection * ySubsection, wSection, hSection, 0, 0, wSection * scale, hSection * scale);

    // Apply color tint if specified
    if (tintColor) {
      textCtx.globalCompositeOperation = 'source-in';
      textCtx.fillStyle = tintColor;
      textCtx.fillRect(0, 0, wSection * scale, hSection * scale);
    }

    // Draw the main text on top of the border
    tempCtx.drawImage(textCanvas, padding, padding);

    // Draw the result to the main canvas
    ctx.drawImage(tempCanvas, x - padding, y - padding);
  } else {
    ctx.drawImage(numberImg, wSection * xSubsection, hSection * ySubsection, wSection, hSection, x, y, wSection * scale, hSection * scale);
  }
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

async function renderFooter<S>(ctx: SkiaContext, gameVersion: number, footerText: string, canvas: CanvasSize) {
  const footerHeight = 50;
  const footerTop = canvas.height - footerHeight;

  // Draw footer background
  ctx.fillStyle = VERSION_SETTINGS[gameVersion as keyof typeof VERSION_SETTINGS]?.footerBackgroundColor || '#00000020';
  ctx.fillRect(0, footerTop, canvas.width, footerHeight);

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
