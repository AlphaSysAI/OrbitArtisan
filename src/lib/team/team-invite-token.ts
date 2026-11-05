import { createHash, randomBytes } from "node:crypto";

/** Jeton envoyé par e-mail (jamais stocké en clair : seule l'empreinte l'est). */
export function newTeamInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashTeamInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isTeamInviteTokenFormat(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Réponse de create_team_invite / accept_team_invite → message pour l'artisan. */
export const TEAM_MESSAGES: Record<string, string> = {
  not_owner: "Seul le titulaire du compte peut gérer l'équipe.",
  invalid_email: "Adresse e-mail invalide.",
  self: "C'est votre propre adresse.",
  plan_not_eligible: "Les utilisateurs supplémentaires sont inclus dans la formule Ultra.",
  seats_full: "Toutes les places de votre formule sont prises (invitations en cours comprises).",
  invalid: "Ce lien d'invitation n'est plus valable. Demandez-en un nouveau.",
  expired: "Ce lien d'invitation a expiré. Demandez-en un nouveau.",
  email_mismatch: "Connectez-vous avec l'adresse à laquelle l'invitation a été envoyée.",
  already_member: "Votre compte fait déjà partie d'une équipe.",
  has_own_account:
    "Cette adresse est déjà utilisée par un compte artisan actif. Utilisez une autre adresse pour rejoindre l'équipe.",
  auth: "Connectez-vous pour rejoindre l'équipe.",
};
