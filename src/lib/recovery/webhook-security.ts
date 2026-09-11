import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/** Comparaison à temps constant de deux chaînes UTF-8. */
export function safeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Vérifie une signature HMAC-SHA256 du corps brut.
 * Accepte les en-têtes `sha256=<hex>` et `<hex>`.
 */
export function verifyHmacSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader?.trim()) return false;

  const provided = signatureHeader.trim();
  const normalized = provided.startsWith("sha256=") ? provided.slice(7) : provided;
  if (!/^[a-f0-9]{64}$/i.test(normalized)) return false;

  const expectedHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  try {
    const a = Buffer.from(normalized.toLowerCase(), "hex");
    const b = Buffer.from(expectedHex, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Authentifie un webhook par secret partagé, MySendingBox ne signant pas ses
 * requêtes. Le secret est lu dans l'en-tête `x-webhook-secret`, à défaut dans
 * le paramètre d'URL `secret` (l'URL de callback reste confidentielle).
 */
export function verifySharedSecret(request: Request, secret: string): boolean {
  const headerSecret = request.headers.get("x-webhook-secret");
  if (headerSecret && safeEqual(headerSecret.trim(), secret)) return true;

  const querySecret = new URL(request.url).searchParams.get("secret");
  return Boolean(querySecret) && safeEqual(querySecret!.trim(), secret);
}
