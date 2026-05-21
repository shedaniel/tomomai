export const levenshtein = (a: string, b: string): number => {
  const tmp: number[][] = [];
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  for (let i = 0; i <= b.length; i++) tmp[i] = [i];
  for (let j = 0; j <= a.length; j++) tmp[0]![j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      tmp[i]![j] =
        b[i - 1] === a[j - 1]
          ? tmp[i - 1]![j - 1]!
          : Math.min(tmp[i - 1]![j - 1]! + 1, Math.min(tmp[i]![j - 1]! + 1, tmp[i - 1]![j]! + 1));
    }
  }
  return tmp[b.length]![a.length]!;
};

export function sortKeys<T>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
  ) as unknown as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Deeply merges two objects. Properties in `source` overwrite properties in `target`.
 * If a property is an object in both, it is merged recursively.
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key]) && isObject(output[key])) {
        output[key as keyof T] = deepMerge(
          output[key] as Record<string, unknown>,
          source[key] as Record<string, unknown>,
        ) as T[keyof T];
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

export function isServer(): boolean {
  return typeof window === "undefined";
}

export function isServerless(): boolean {
  return (
    process.env.VERCEL === "1" ||
    process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined ||
    process.env.NETLIFY === "true" ||
    process.cwd() === "/var/task"
  );
}

export async function awaitWrapper<T>(
  promise: Promise<T>,
): Promise<[T | null, Error | null]> {
  return promise
    .then((data) => [data, null] as [T, null])
    .catch((error) => [null, error as Error] as [null, Error]);
}

export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function maxBy<T>(array: T[], iteratee: (item: T) => number): T | undefined {
  if (array.length === 0) return undefined;
  let maxItem = array[0]!;
  let maxValue = iteratee(maxItem);
  for (let i = 1; i < array.length; i++) {
    const value = iteratee(array[i]!);
    if (value > maxValue) {
      maxValue = value;
      maxItem = array[i]!;
    }
  }
  return maxItem;
}
