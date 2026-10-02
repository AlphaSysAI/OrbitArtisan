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

