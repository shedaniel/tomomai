export function normalizeName(text: string) {
  return text.normalize("NFKC").trim();
}
