import "server-only";

import { signToken, verifyToken } from "@/lib/security/signed-token";
import { getPublicSiteUrl } from "@/lib/site-url";

/**
 * Lien « Répondre au devis » envoyé par e-mail : `<quoteId>.<signature>`.
 * L'expiration n'est pas dans le jeton : la validité du devis (valid_until) et
 * son statut, relus en base, font foi.
 */
export function buildQuoteResponseToken(quoteId: string, key?: string): string {
  return signToken("quote-response", quoteId, { key });
}

export function verifyQuoteResponseToken(token: string, key?: string): string | null {
  return verifyToken("quote-response", token, { key });
}

export function quoteResponseUrl(quoteId: string): string {
  return `${getPublicSiteUrl()}/devis/reponse/${buildQuoteResponseToken(quoteId)}`;
}
