import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getPublicSiteUrl } from "@/lib/site-url";

/**
 * Lien « Répondre au devis » envoyé par e-mail : `<quoteId>.<signature>`.
 * HMAC-SHA256 (même clé que les liens de suivi RDV) : prouve que le lien vient
 * de Soline, rien n'est stocké. L'expiration n'est pas dans le jeton : c'est la
 * validité du devis (valid_until) et son statut, relus en base, qui font foi.
 */
function secret(): string {
  const key = process.env.APPOINTMENT_LINK_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("APPOINTMENT_LINK_SECRET manquant");
  return key;
}

function sign(quoteId: string, key: string): string {
  return createHmac("sha256", key).update(`quote-response:${quoteId}`).digest("base64url").slice(0, 32);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildQuoteResponseToken(quoteId: string, key: string = secret()): string {
  return `${quoteId}.${sign(quoteId, key)}`;
}

export function verifyQuoteResponseToken(token: string, key: string = secret()): string | null {
  const [id, sig, extra] = decodeURIComponent(token).split(".");
  if (extra !== undefined || !id || !sig || !UUID_RE.test(id) || sig.length !== 32) return null;
  const expected = Buffer.from(sign(id, key));
  const provided = Buffer.from(sig);
  return expected.length === provided.length && timingSafeEqual(expected, provided) ? id : null;
}

export function quoteResponsePath(quoteId: string): string {
  return `/devis/reponse/${buildQuoteResponseToken(quoteId)}`;
}

export function quoteResponseUrl(quoteId: string): string {
  return `${getPublicSiteUrl()}${quoteResponsePath(quoteId)}`;
}
