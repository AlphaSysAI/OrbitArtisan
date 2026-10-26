import { randomBytes } from "node:crypto";

/**
 * Slug provisoire d'un profil créé à l'entrée de l'onboarding, avant que la raison
 * sociale soit connue. Aléatoire (non devinable) tant qu'il n'est pas remplacé par un
 * slug lisible à la fin de l'onboarding. Respecte profiles_slug_format.
 */
const PROVISIONAL = /^nouveau-[0-9a-f]{12}$/;

export function provisionalSlug(): string {
  return `nouveau-${randomBytes(6).toString("hex")}`;
}

export function isProvisionalSlug(slug: string | null | undefined): boolean {
  return typeof slug === "string" && PROVISIONAL.test(slug);
}

/** « Plomberie Dupont & Fils » → « plomberie-dupont-fils » (60 caractères max). */
export function slugFromBusinessName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}
