import { safeNextPath } from "@/lib/auth/safe-next";

/** Adresse e-mail plausible (garde-fou : on ne recopie pas n'importe quoi dans un champ). */
export function sanitizeEmailParam(raw: string | null | undefined): string {
  const value = (raw ?? "").trim().toLowerCase();
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "";
  return value;
}

/**
 * Lien de retour du mail de confirmation Supabase. L'e-mail y est glissé pour préremplir
 * la connexion quand la session ne peut pas être ouverte automatiquement (mail ouvert sur
 * un autre appareil ou dans le navigateur intégré d'une messagerie).
 */
export function buildEmailConfirmationRedirect(siteUrl: string, next: string, email: string): string {
  const qs = new URLSearchParams({ next });
  const cleanEmail = sanitizeEmailParam(email);
  if (cleanEmail) qs.set("email", cleanEmail);
  return `${siteUrl.replace(/\/+$/, "")}/auth/callback?${qs.toString()}`;
}

/** Espace concerné par la destination : sert à choisir la bonne page de connexion. */
function roleForNext(next: string): "artisan" | "particulier" {
  return next.startsWith("/compte") || next.startsWith("/mes-devis") ? "particulier" : "artisan";
}

/**
 * Page de connexion à ouvrir quand le lien du mail n'a pas pu ouvrir de session.
 * - `linkError` : Supabase a refusé le lien (expiré ou déjà utilisé).
 * - sinon : l'adresse est confirmée côté Supabase, il reste à se connecter.
 */
export function buildCallbackLoginPath(params: {
  next: string | null | undefined;
  email: string | null | undefined;
  linkError?: string | null;
}): string {
  const next = safeNextPath(params.next, "/app");
  const qs = new URLSearchParams({ role: roleForNext(next), next });
  const email = sanitizeEmailParam(params.email);
  if (email) qs.set("email", email);
  if (params.linkError) {
    qs.set("error", params.linkError === "otp_expired" ? "link_expired" : "link_invalid");
  } else {
    qs.set("success", "email_confirmed");
  }
  return `/login?${qs.toString()}`;
}

/** Page où l'utilisateur choisit son nouveau mot de passe (session de récupération ouverte). */
export const NEW_PASSWORD_PATH = "/login/nouveau-mot-de-passe";
export const FORGOT_PASSWORD_PATH = "/login/mot-de-passe-oublie";

/**
 * Où envoyer l'utilisateur quand un lien reçu par e-mail n'a pas pu ouvrir de session.
 * Réinitialisation : retour au formulaire « mot de passe oublié » (il faut un nouveau lien).
 * Autres cas : connexion, e-mail prérempli.
 */
export function buildAuthLinkFailurePath(params: {
  next: string | null | undefined;
  email: string | null | undefined;
  linkError?: string | null;
}): string {
  const next = safeNextPath(params.next, "/app");
  if (next.startsWith(NEW_PASSWORD_PATH)) {
    const qs = new URLSearchParams({ error: "link_expired" });
    const email = sanitizeEmailParam(params.email);
    if (email) qs.set("email", email);
    return `${FORGOT_PASSWORD_PATH}?${qs.toString()}`;
  }
  return buildCallbackLoginPath(params);
}

const OTP_TYPES = ["signup", "email", "recovery", "invite", "magiclink", "email_change"] as const;
export type EmailOtpLinkType = (typeof OTP_TYPES)[number];

export function parseEmailOtpType(raw: string | null | undefined): EmailOtpLinkType | null {
  return (OTP_TYPES as readonly string[]).includes(raw ?? "") ? (raw as EmailOtpLinkType) : null;
}

/** Lien direct (token_hash) : fonctionne sur n'importe quel appareil, contrairement au flux PKCE. */
export function buildTokenHashLink(siteUrl: string, tokenHash: string, type: EmailOtpLinkType, next: string): string {
  const qs = new URLSearchParams({ token_hash: tokenHash, type, next });
  return `${siteUrl.replace(/\/+$/, "")}/auth/confirm?${qs.toString()}`;
}
