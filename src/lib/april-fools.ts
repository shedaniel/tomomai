export function isAprilFools2026JST() {
  const now = new Date();
  const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  // April 1-2, 2026 JST
  return jst.getFullYear() === 2026 && jst.getMonth() === 3 && (jst.getDate() === 1 || jst.getDate() === 2);
}
