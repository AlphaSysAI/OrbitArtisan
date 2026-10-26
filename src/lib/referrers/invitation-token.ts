import { createHash, randomBytes } from "node:crypto";

/**
 * Jeton d'invitation apporteur : 256 bits aléatoires dans le lien, seul le SHA-256 est
 * stocké. Une fuite de la base ne donne aucun lien utilisable.
 */
export const REFERRER_INVITATION_TTL_MS = 14 * 86_400_000;

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isInvitationTokenFormat(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}
