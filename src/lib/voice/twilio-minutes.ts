/** Calcule les minutes facturables selon la règle Twilio (minute entamée = minute pleine). */
export function computeTwilioMinutesBilled(callStatus: string, callDurationRaw: string | number | null | undefined): number {
  const status = callStatus.trim().toLowerCase();
  if (status !== "completed") return 0;

  const durationSeconds = Number(callDurationRaw ?? 0);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;

  return Math.ceil(durationSeconds / 60);
}

export function parseTwilioFormBody(rawBody: string): Record<string, string> {
  const params = new URLSearchParams(rawBody);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

/** Normalise un numéro Twilio vers E.164 basique pour la recherche en base. */
export function normalizePhoneE164(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("+")) {
    return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0") && digits.length === 10) return `+33${digits.slice(1)}`;
  if (digits.length >= 10) return `+${digits}`;

  return trimmed;
}
