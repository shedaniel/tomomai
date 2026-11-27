export function isAprilFools2026JST() {
  const now = new Date();
  const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  // April 1-2, 2026 JST
  return jst.getFullYear() === 2026 && jst.getMonth() === 3 && (jst.getDate() === 1 || jst.getDate() === 2);
}

const NET_OPENS_AT = Date.UTC(2027, 2, 31, 15, 0, 0);
const NET_CLOSES_AT = Date.UTC(2027, 3, 3, 15, 0, 0);

/** tomomai NET is open from 2027-04-01 00:00:00 to 2027-04-03 23:59:59 JST. */
export function isAprilFools2027JST(now: number = Date.now()) {
  return now >= NET_OPENS_AT && now < NET_CLOSES_AT;
}
