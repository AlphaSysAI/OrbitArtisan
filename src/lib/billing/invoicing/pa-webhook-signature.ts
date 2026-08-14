import { createHmac, timingSafeEqual } from "node:crypto";

/** Vérifie la signature HMAC-SHA256 (`X-PA-Signature: sha256=<hex>`). */
export function verifyPaWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader?.trim()) return false;

  const expectedHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.trim();

  const normalized = provided.startsWith("sha256=") ? provided.slice(7) : provided;
  if (!/^[a-f0-9]{64}$/i.test(normalized)) return false;

  try {
    const a = Buffer.from(normalized, "hex");
    const b = Buffer.from(expectedHex, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
