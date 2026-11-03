/** Horizontal placement for a tooltip pinned to a point, so it stays inside the chart near either edge. */
export function edgeAnchor(fraction: number): string {
  if (fraction < 0.25) return "translate-x-0";
  if (fraction > 0.75) return "-translate-x-full";
  return "-translate-x-1/2";
}
