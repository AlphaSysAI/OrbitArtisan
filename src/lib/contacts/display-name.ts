export type ContactNameInput = {
  /** Nom saisi sur devis, facture, RDV, lead… */
  name?: string | null;
  /** Nom du profil client (`customer_profiles.display_name`) */
  profileName?: string | null;
  email?: string | null;
  fallback?: string;
};

export function emailLocalPart(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split("@")[0]?.trim();
  return local || null;
}

export function looksLikeEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Vrai si `name` ressemble au préfixe de l'e-mail (identité dérivée, pas un vrai nom). */
export function looksLikeEmailLocalPart(name: string, email: string | null | undefined): boolean {
  const local = emailLocalPart(email);
  if (!local) return false;
  return name.trim().toLowerCase() === local.toLowerCase();
}

function isUsablePersonName(name: string, email?: string | null): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "Client") return false;
  if (looksLikeEmailAddress(trimmed)) return false;
  if (email && looksLikeEmailLocalPart(trimmed, email)) return false;
  return true;
}

/** Nom affiché pour un contact — jamais l'e-mail ni son préfixe. */
export function formatContactDisplayName(input: ContactNameInput): string {
  const fallback = input.fallback ?? "Client";
  const candidates = [input.profileName, input.name];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (isUsablePersonName(candidate, input.email)) return candidate.trim();
  }

  return fallback;
}

export function splitPersonName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function joinPersonName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}
