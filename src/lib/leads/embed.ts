/** Contrat partagé entre la page /embed/[slug], public/embed.js et les réglages. */

export const EMBED_MESSAGE_NAMESPACE = "soline-embed";

export type EmbedTheme = "light" | "dark" | "auto";

export function parseEmbedTheme(raw: string | string[] | undefined): EmbedTheme {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "dark" || value === "auto" ? value : "light";
}

/** Extrait à coller sur un site externe (WordPress, Wix, site fait main…). */
export function buildEmbedSnippet(appUrl: string, slug: string, marketingUrl?: string): string {
  const scriptBase = (marketingUrl ?? appUrl).replace(/\/$/, "");
  const appBase = appUrl.replace(/\/$/, "");
  const appAttr = scriptBase !== appBase ? ` data-app-url="${appBase}"` : "";
  return `<script src="${scriptBase}/embed.js" data-artisan="${slug}"${appAttr} defer></script>`;
}
