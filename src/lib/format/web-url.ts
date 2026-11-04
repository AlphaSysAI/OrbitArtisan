/**
 * Normalise une adresse web saisie à la main : « www.exemple.fr » ou
 * « exemple.fr/contact » deviennent « https://… ». Renvoie null si la saisie
 * ne ressemble pas à une adresse web (pas de domaine avec un point, espaces,
 * autre protocole que http/https).
 */
export function normalizeWebUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value || /\s/.test(value)) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : /^[a-z][a-z0-9+.-]*:/i.test(value) ? null : `https://${value}`;
  if (!withScheme) return null;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname;
    if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) return null;
    return withScheme;
  } catch {
    return null;
  }
}
