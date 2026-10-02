import "server-only";

import { signToken, verifyToken } from "@/lib/security/signed-token";

/**
 * Lien de suivi d'une demande de RDV faite sans compte : `<id>.<signature>`.
 * Le même lien reste valable pour tous les e-mails envoyés au client.
 */
export function buildTrackingToken(appointmentId: string, key?: string): string {
  return signToken("appointment-tracking", appointmentId, { key });
}

/** Renvoie l'id du RDV si le jeton est authentique, sinon null. */
export function verifyTrackingToken(token: string, key?: string): string | null {
  return verifyToken("appointment-tracking", token, { key });
}

export function trackingPath(appointmentId: string): string {
  return `/rdv/suivi/${buildTrackingToken(appointmentId)}`;
}
