/** URL de l'application SaaS (auth, app, webhooks, vitrines, embed iframe). */
export function getPublicSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

/** URL du site marketing (landing, pages légales). */
export function getMarketingSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_MARKETING_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return getPublicSiteUrl();
}

export function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Séparation solinebtp.fr / app.solinebtp.fr active en prod. */
export function isDomainSplitEnabled(): boolean {
  const marketing = process.env.NEXT_PUBLIC_MARKETING_URL?.trim();
  const app = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!marketing || !app) return false;
  const marketingHost = hostnameFromUrl(marketing);
  const appHost = hostnameFromUrl(app);
  return Boolean(marketingHost && appHost && marketingHost !== appHost);
}

/** Lien « accueil » : marketing en prod, `/` en local mono-domaine. */
export function getMarketingHomeHref(): string {
  if (isDomainSplitEnabled()) return getMarketingSiteUrl();
  return "/";
}
