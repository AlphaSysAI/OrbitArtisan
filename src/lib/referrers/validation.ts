import { z } from "zod";

import { frenchVatFromSiren, isValidSiren, isValidSiret, onlyDigits } from "@/lib/onboarding/identifiers";
import { normalizeCustomerPhone } from "@/lib/phone";

/**
 * Contrôles des saisies apporteur (module pur, testable). Mêmes règles que les
 * contraintes SQL de la migration 64 : un formulaire valide ici ne peut pas être
 * refusé par la base, et inversement la base reste la dernière barrière.
 */

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const REFERRER_PASSWORD_MIN = 8;

const name = (label: string) =>
  z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, `${label} requis`).max(80, `${label} trop long`));

export type FieldErrors = Partial<Record<string, string>>;

function collectErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

// --- Création par l'admin ---------------------------------------------------------------

export const ReferrerInvitationInputSchema = z.object({
  email: z
    .string()
    .transform((v) => v.trim().toLowerCase())
    .pipe(z.string().max(254).regex(EMAIL_PATTERN, "Adresse e-mail invalide")),
  first_name: name("Prénom"),
  last_name: name("Nom"),
  siren: z
    .string()
    .transform((v) => onlyDigits(v))
    .pipe(z.string().refine(isValidSiren, "SIREN invalide (9 chiffres, clé de contrôle)")),
});
export type ReferrerInvitationInput = z.infer<typeof ReferrerInvitationInputSchema>;

export function parseReferrerInvitationInput(raw: Record<string, unknown>):
  | { ok: true; value: ReferrerInvitationInput }
  | { ok: false; errors: FieldErrors } {
  const r = ReferrerInvitationInputSchema.safeParse(pickStrings(raw, Object.keys(ReferrerInvitationInputSchema.shape)));
  return r.success ? { ok: true, value: r.data } : { ok: false, errors: collectErrors(r.error) };
}

// --- Finalisation par l'apporteur ------------------------------------------------------

export type ReferrerOnboardingValue = {
  first_name: string;
  last_name: string;
  phone: string;
  business_name: string;
  siret: string | null;
  address_line1: string;
  address_line2: string | null;
  postal_code: string;
  city: string;
  vat_regime: "normal" | "franchise";
  vat_number: string | null;
  password: string;
};

const OnboardingBaseSchema = z.object({
  first_name: name("Prénom"),
  last_name: name("Nom"),
  phone: z
    .string()
    .transform((v) => normalizeCustomerPhone(v) ?? "")
    .pipe(z.string().min(1, "Numéro de téléphone invalide")),
  business_name: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Dénomination requise").max(160, "Dénomination trop longue")),
  siret: z.string().transform((v) => onlyDigits(v)),
  address_line1: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(3, "Adresse requise").max(200, "Adresse trop longue")),
  address_line2: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(200, "Complément trop long")),
  postal_code: z
    .string()
    .transform((v) => v.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{5}$/, "Code postal invalide (5 chiffres)")),
  city: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Ville requise").max(120, "Ville trop longue")),
  vat_regime: z.enum(["normal", "franchise"], { message: "Choisis ton régime de TVA" }),
  vat_number: z.string().transform((v) => v.replace(/\s/g, "").toUpperCase()),
  password: z.string().min(REFERRER_PASSWORD_MIN, `Au moins ${REFERRER_PASSWORD_MIN} caractères`).max(72, "Mot de passe trop long"),
  password_confirm: z.string(),
  accept_terms: z.literal("1", { message: "Acceptation requise" }),
});

/** `siren` vient de l'invitation (saisi par l'admin) : l'apporteur ne peut pas le changer. */
export function parseReferrerOnboarding(
  raw: Record<string, unknown>,
  siren: string,
): { ok: true; value: ReferrerOnboardingValue } | { ok: false; errors: FieldErrors } {
  const r = OnboardingBaseSchema.safeParse(pickStrings(raw, Object.keys(OnboardingBaseSchema.shape)));
  const errors: FieldErrors = r.success ? {} : collectErrors(r.error);
  if (!r.success) return { ok: false, errors };
  const v = r.data;

  if (v.password !== v.password_confirm) errors.password_confirm = "Les mots de passe ne correspondent pas";
  if (v.siret && (!isValidSiret(v.siret) || !v.siret.startsWith(siren))) {
    errors.siret = "SIRET invalide ou ne correspondant pas au SIREN";
  }
  // Commission d'apport = prestation de services : TVA 20 % (n° intracommunautaire obligatoire
  // sur les factures) ou franchise en base (art. 293 B du CGI), jamais les taux BTP.
  let vatNumber: string | null = null;
  if (v.vat_regime === "normal") {
    const expected = frenchVatFromSiren(siren);
    if (!v.vat_number) errors.vat_number = "N° de TVA intracommunautaire requis";
    else if (v.vat_number !== expected) errors.vat_number = `N° de TVA incohérent avec le SIREN (attendu : ${expected})`;
    else vatNumber = v.vat_number;
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      first_name: v.first_name,
      last_name: v.last_name,
      phone: v.phone,
      business_name: v.business_name,
      siret: v.siret || null,
      address_line1: v.address_line1,
      address_line2: v.address_line2 || null,
      postal_code: v.postal_code,
      city: v.city,
      vat_regime: v.vat_regime,
      vat_number: vatNumber,
      password: v.password,
    },
  };
}

/** Seuls les champs attendus, toujours en chaîne (champ absent = vide) : rien d'autre n'est lu. */
function pickStrings(raw: Record<string, unknown>, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, typeof raw[k] === "string" ? (raw[k] as string) : ""]));
}
