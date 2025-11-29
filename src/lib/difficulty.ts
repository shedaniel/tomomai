const ACHIEVEMENTS = [
  { achievement: 1005000, rate: "SSS+" },
  { achievement: 1000000, rate: "SSS" },
  { achievement: 995000, rate: "SS+" },
  { achievement: 990000, rate: "SS" },
  { achievement: 980000, rate: "S+" },
  { achievement: 970000, rate: "S" },
  { achievement: 940000, rate: "AAA" },
  { achievement: 900000, rate: "AA" },
  { achievement: 800000, rate: "A" },
  { achievement: 750000, rate: "BBB" },
  { achievement: 700000, rate: "BB" },
  { achievement: 600000, rate: "B" },
  { achievement: 500000, rate: "C" },
  { achievement: 0, rate: "D" },
]

function getAchievementRate(achievement: number): string {
  return ACHIEVEMENTS.find(a => achievement >= a.achievement)?.rate ?? "D";
}

export {
  ACHIEVEMENTS,
  getAchievementRate,
}