/**
 * Destination après connexion : chemin interne uniquement. Empêche la redirection
 * ouverte (`/login?next=https://site-pirate.fr`), classique dans les liens d'hameçonnage.
 */
export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  const value = (raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return fallback;
  }
  return value;
}
