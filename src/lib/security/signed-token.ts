import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Jetons de lien sans état `<uuid>.<signature>` (HMAC-SHA256, base64url tronqué).
 * Le `scope` sépare les usages : un jeton de suivi RDV ne vaut jamais réponse
 * de devis ou désinscription prospect. Rien n'est stocké ; l'expiration et les
 * droits restent ceux relus en base par l'appelant.
 * Clé : APPOINTMENT_LINK_SECRET, à défaut la clé service role. Jamais de clé vide.
 */
export type SignedTokenScope = "appointment-tracking" | "quote-response" | "prospect-optout";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_SIG_LENGTH = 32;

export function linkSecret(): string {
  const key = process.env.APPOINTMENT_LINK_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("APPOINTMENT_LINK_SECRET manquant");
  return key;
}

function sign(scope: SignedTokenScope, id: string, key: string, sigLength: number): string {
  if (!key) throw new Error("Clé de signature vide");
  return createHmac("sha256", key).update(`${scope}:${id}`).digest("base64url").slice(0, sigLength);
}

export function signToken(
  scope: SignedTokenScope,
  id: string,
  opts: { key?: string; sigLength?: number } = {},
): string {
  return `${id}.${sign(scope, id, opts.key ?? linkSecret(), opts.sigLength ?? DEFAULT_SIG_LENGTH)}`;
}

/** Renvoie l'uuid si le jeton est authentique pour ce scope, sinon null (comparaison à temps constant). */
export function verifyToken(
  scope: SignedTokenScope,
  token: string,
  opts: { key?: string; sigLength?: number } = {},
): string | null {
  const sigLength = opts.sigLength ?? DEFAULT_SIG_LENGTH;
  let raw: string;
  try {
    raw = decodeURIComponent(token);
  } catch {
    return null;
  }
  const [id, sig, extra] = raw.split(".");
  if (extra !== undefined || !id || !sig || !UUID_RE.test(id) || sig.length !== sigLength) return null;
  const expected = Buffer.from(sign(scope, id, opts.key ?? linkSecret(), sigLength));
  const provided = Buffer.from(sig);
  return expected.length === provided.length && timingSafeEqual(expected, provided) ? id : null;
}
