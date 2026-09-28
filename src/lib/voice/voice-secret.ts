import { timingSafeEqual } from "node:crypto";

/**
 * Normalise un secret partagé ElevenLabs ↔ Soline : tolère guillemets, préfixe
 * « Bearer » / « Bearer: » et espaces ou retours à la ligne parasites (collage
 * dans Vercel ou dans un secret ElevenLabs).
 */
export function normalizeVoiceSecret(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^bearer\s*:?\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

/** Compare l'en-tête Authorization reçu à VOICE_AI_TOOL_SECRET (temps constant). */
export function verifyVoiceToolSecret(
  authorizationHeader: string | null | undefined,
  expectedRaw: string | null | undefined = process.env.VOICE_AI_TOOL_SECRET,
): { ok: boolean; configured: boolean; diagnostic: Record<string, unknown> } {
  const expected = normalizeVoiceSecret(expectedRaw);
  const provided = normalizeVoiceSecret(authorizationHeader);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const ok = expected.length > 0 && a.length === b.length && timingSafeEqual(a, b);
  return {
    ok,
    configured: expected.length > 0,
    // Jamais le secret : présence, préfixe et longueurs uniquement.
    diagnostic: {
      headerPresent: authorizationHeader != null,
      bearerPrefix: /^\s*"?bearer/i.test(authorizationHeader ?? ""),
      providedLength: provided.length,
      expectedLength: expected.length,
    },
  };
}
