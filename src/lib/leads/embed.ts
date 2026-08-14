/** Contrat partagé entre la page /embed/[slug], public/embed.js et les réglages. */

export const EMBED_MESSAGE_NAMESPACE = "orbit-embed";

export type EmbedTheme = "light" | "dark" | "auto";

export function parseEmbedTheme(raw: string | string[] | undefined): EmbedTheme {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "dark" || value === "auto" ? value : "light";
}

/** Extrait à coller sur un site externe (WordPress, Wix, site fait main…). */
export function buildEmbedSnippet(siteUrl: string, slug: string): string {
  return `<script src="${siteUrl}/embed.js" data-artisan="${slug}" defer></script>`;
}
