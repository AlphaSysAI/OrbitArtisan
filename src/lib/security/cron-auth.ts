import { timingSafeEqual } from "node:crypto";

/**
 * Crons Vercel : `Authorization: Bearer <CRON_SECRET>`. Fermé par défaut : sans
 * CRON_SECRET configuré, aucune exécution (relances SMS, facturation Stripe,
 * achats de numéros… ne doivent jamais être déclenchables par un tiers).
 */
export function isAuthorizedCronRequest(request: Request, secret = process.env.CRON_SECRET): boolean {
  const expected = secret?.trim();
  if (!expected) return false;
  const provided = request.headers.get("authorization") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
