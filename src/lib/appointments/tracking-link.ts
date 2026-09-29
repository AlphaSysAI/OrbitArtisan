import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Lien de suivi d'une demande de RDV faite sans compte : `<id>.<signature>`.
 * La signature (HMAC-SHA256) prouve que le lien vient de Soline ; rien n'est stocké
 * en base, et le même lien reste valable pour tous les e-mails envoyés au client.
 * Clé : APPOINTMENT_LINK_SECRET, à défaut la clé service role (jamais exposée au navigateur).
 */
function secret(): string {
  const key = process.env.APPOINTMENT_LINK_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("APPOINTMENT_LINK_SECRET manquant");
  return key;
}

function sign(appointmentId: string, key: string): string {
  return createHmac("sha256", key).update(`appointment-tracking:${appointmentId}`).digest("base64url").slice(0, 32);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildTrackingToken(appointmentId: string, key: string = secret()): string {
  return `${appointmentId}.${sign(appointmentId, key)}`;
}

/** Renvoie l'id du RDV si le jeton est authentique, sinon null. */
export function verifyTrackingToken(token: string, key: string = secret()): string | null {
  const [id, sig] = token.split(".");
  if (!id || !sig || !UUID_RE.test(id) || sig.length !== 32) return null;
  const expected = Buffer.from(sign(id, key));
  const provided = Buffer.from(sig);
  return expected.length === provided.length && timingSafeEqual(expected, provided) ? id : null;
}

export function trackingPath(appointmentId: string): string {
  return `/rdv/suivi/${buildTrackingToken(appointmentId)}`;
}
