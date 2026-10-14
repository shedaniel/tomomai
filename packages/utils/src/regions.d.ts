export function resolveEnabledRegions<R extends string>(
  value: string | undefined,
  supported: readonly R[],
): { regions: R[]; invalid: boolean };
