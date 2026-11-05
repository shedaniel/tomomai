import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export {
  levenshtein,
  sortKeys,
  deepMerge,
  isServerless,
  awaitWrapper,
  maxBy,
} from "@tomomai/utils";
export { getLanguages } from "@tomomai/i18n/languages";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
