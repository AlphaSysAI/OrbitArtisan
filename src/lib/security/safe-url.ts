/**
 * Retourne l'URL normalisée si (et seulement si) elle est absolue en http(s).
 * Bloque javascript:, data:, vbscript:, file:… avant tout rendu en href/src.
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
