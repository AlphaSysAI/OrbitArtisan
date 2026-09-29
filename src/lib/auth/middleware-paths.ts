/**
 * Perf (refacto latence, point 3) : préfixes dont les pages / actions lisent la
 * session Supabase. Seules ces routes passent par Supabase dans le middleware
 * (rafraîchissement des cookies de session + garde d'accès). Les autres
 * (/embed, /estimation, pages légales, /intervention, icônes…) ne touchent pas
 * à la session : aucun appel Supabase, TTFB réduit pour prospects et widgets.
 *
 * ⚠️ Une nouvelle page publique qui lit la session (getUser / getCurrentUser)
 * doit être ajoutée ici, sinon le refresh token n'est pas réécrit en cookie.
 */
const SESSION_PATH_PREFIXES = [
  "/app",
  "/compte",
  "/mes-devis",
  "/admin",
  "/login",
  "/register",
  "/inscription-client",
  "/invitation",
  "/site",
  "/auth",
  "/rdv",
] as const;

export function pathUsesSession(pathname: string): boolean {
  if (pathname === "/") return true; // redirection racine PWA / domaine app
  return SESSION_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Routes où le middleware a besoin du profil artisan (aiguillage /app ↔ /compte, onboarding, abonnement). */
export function pathNeedsArtisanProfile(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/compte" ||
    pathname.startsWith("/compte/")
  );
}
