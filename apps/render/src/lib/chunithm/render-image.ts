import type { Canvas } from "skia-canvas";
import type { ImageCache } from "../render-image";
import type { ChunithmDailyPlaysImage, ChunithmRatingImage } from "./charts";

// Each image lists the URLs it draws, which the route loads into the cache before render runs.

export function ratingImageResources(image: ChunithmRatingImage): string[] {
  return [image.header.iconUrl, ...image.newCharts.map(chart => chart.cover), ...image.oldCharts.map(chart => chart.cover)];
}

export async function renderRatingImage(_image: ChunithmRatingImage, _cache: ImageCache): Promise<Canvas> {
  throw new Error("The CHUNITHM rating image has no design yet");
}

export function dailyPlaysImageResources(image: ChunithmDailyPlaysImage): string[] {
  return [image.header.iconUrl, ...image.plays.map(play => play.cover)];
}

export async function renderDailyPlaysImage(_image: ChunithmDailyPlaysImage, _cache: ImageCache): Promise<Canvas> {
  throw new Error("The CHUNITHM daily plays image has no design yet");
}
