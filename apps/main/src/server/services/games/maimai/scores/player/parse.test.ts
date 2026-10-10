import { expect, it } from "vitest";
import { parsePlayerData } from "./parse";

const profile = (icon: string, courseRank: string, classRank: string) => `<div class="see_through_block">
  <img class="w_112" src="${icon}">
  <div class="name_block">Player</div>
  <div class="rating_block">15000</div>
  <div class="trophy_block trophy_Gold">Title</div>
  <div class="p_l_10 f_l f_14">×12</div>
  <div class="t_r f_12">現バージョンプレイ回数：195 累計プレイ回数：909</div>
  <img class="h_35 f_l" src="${courseRank}">
  <img class="h_35 f_l" src="${classRank}">
</div>`;

it("resolves the profile images against the player's own site", () => {
  const player = parsePlayerData(profile("/maimai-mobile/img/Icon/a.png", "/maimai-mobile/img/course/b.png", "https://cdn.example.test/c.png"), "jp");
  expect(player).toMatchObject({
    iconUpstreamUrl: "https://maimaidx.jp/maimai-mobile/img/Icon/a.png",
    courseRankUrl: "https://maimaidx.jp/maimai-mobile/img/course/b.png",
    classRankUrl: "https://cdn.example.test/c.png",
    displayName: "Player",
    versionPlayCount: 195,
    totalPlayCount: 909,
  });
});
