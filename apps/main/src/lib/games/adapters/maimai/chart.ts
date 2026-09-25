export function requireMaimaiConstant(value: number | null): number {
  if (value === null) throw new Error("Maimai chart constant is unavailable");
  return value;
}
