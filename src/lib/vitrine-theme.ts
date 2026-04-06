/** Couleurs suggérées par métier (mots-clés dans le nom d’activité) si l’artisan n’a pas choisi de couleur. */
const TRADE_KEYWORDS: { pattern: RegExp; hex: string }[] = [
  { pattern: /plomb|plomberie|chauffage|sanitaire/i, hex: "#0284c7" },
  { pattern: /électric|electric|éclairage/i, hex: "#f59e0b" },
  { pattern: /menuis|charpent|bois|ébéniste/i, hex: "#92400e" },
  { pattern: /peint|décor|revêtement/i, hex: "#7c3aed" },
  { pattern: /jardin|paysag|vert|espaces verts/i, hex: "#16a34a" },
  { pattern: /carrel|faïence|sol|mason|maçonnerie/i, hex: "#dc2626" },
  { pattern: /serrur|clé|verrou|sécurité/i, hex: "#475569" },
  { pattern: /nettoyage|ménage|propre/i, hex: "#06b6d4" },
];

/** Couleur par défaut “chaleureuse artisan” si aucun mot-clé ne correspond. */
export const VITRINE_DEFAULT_ACCENT = "#ea580c";

export function isValidAccentHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

export function normalizeAccentHex(value: string): string {
  return value.trim().toLowerCase();
}

/** Couleur finale : choix artisan, sinon déduction métier, sinon défaut. */
export function resolveVitrineAccent(
  accentColor: string | null | undefined,
  businessName: string,
): string {
  if (accentColor && isValidAccentHex(accentColor)) {
    return normalizeAccentHex(accentColor);
  }
  const name = businessName.toLowerCase();
  for (const { pattern, hex } of TRADE_KEYWORDS) {
    if (pattern.test(name)) return hex;
  }
  return VITRINE_DEFAULT_ACCENT;
}

/** Assombri pour texte sur fond clair (titres). */
export function shadeAccent(hex: string, factor = 0.35): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c * (1 - factor));
  return `#${mix(r).toString(16).padStart(2, "0")}${mix(g).toString(16).padStart(2, "0")}${mix(b).toString(16).padStart(2, "0")}`;
}

/** Légère teinte de fond pour le hero. */
export function heroGradientTop(accent: string): string {
  return `linear-gradient(165deg, ${accent}22 0%, ${accent}08 28%, #fffbf5 55%, #ffffff 100%)`;
}
