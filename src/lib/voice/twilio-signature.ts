import "server-only";

import twilio from "twilio";

export function validateTwilioRequestSignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature?.trim()) return false;
  return twilio.validateRequest(authToken, signature, url, params);
}

export function resolveTwilioWebhookUrl(request: Request): string {
  const configured = process.env.TWILIO_STATUS_CALLBACK_URL?.trim();
  if (configured) return configured;

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) {
    const path = new URL(request.url).pathname;
    return `${forwardedProto}://${forwardedHost}${path}`;
  }

  return request.url;
}
