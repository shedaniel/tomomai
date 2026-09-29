import { expect, it } from "vitest";
import { parseAreaEvents, parseEventAreaEvents } from "./parse";

const area = (src: string) => `<div class="m_10 m_t_0 f_0"><div class="map_name_block_inner">Area</div><div class="basic_block">12km</div><img class="w_180" src="${src}"></div>`;
const eventArea = (src: string) => `<div class="eventmap_container"><div class="map_name_block_inner">Event</div><div class="basic_block">3km</div><img class="w_180" src="${src}"></div>`;

it.each([
  ["cn", "https://maimai.wahlap.com/maimai-mobile/img/map/a.png"],
  ["jp", "https://maimaidx.jp/maimai-mobile/img/map/a.png"],
] as const)("resolves %s map images against that region's site", (region, expected) => {
  expect(parseAreaEvents(area("/maimai-mobile/img/map/a.png"), region)[0].imageUrl).toBe(expected);
  expect(parseEventAreaEvents(eventArea("/maimai-mobile/img/map/a.png"), region)[0].imageUrl).toBe(expected);
});
