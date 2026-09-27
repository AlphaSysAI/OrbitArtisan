import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveVoiceQuota } from "@/lib/voice/resolve-voice-quota";
import { resolveArtisanIdByCalledNumber } from "@/lib/voice/voice-quota-service";

/**
 * Webhook d'initiation de conversation ElevenLabs (appels Twilio entrants).
 * Appelé AVANT que Soline ne décroche : fournit les variables dynamiques
 * utilisées dans le message d'accueil et le prompt de l'agent
 * ({{business_name}}, {{artisan_name}}, {{accepts_calls}}).
 *
 * Auth : en-tête `Authorization: Bearer <VOICE_AI_TOOL_SECRET>`, à déclarer comme
 * secret d'en-tête dans les réglages du webhook ElevenLabs.
 * Doit répondre vite : toute latence retarde le décroché.
 */
export const runtime = "nodejs";

const FALLBACK = {
  business_name: "l'entreprise",
  artisan_name: "l'artisan",
  accepts_calls: "true",
};

function initResponse(dynamicVariables: Record<string, string>) {
  return NextResponse.json({
    type: "conversation_initiation_client_data",
    dynamic_variables: dynamicVariables,
  });
}

export async function POST(request: Request) {
  const expected = process.env.VOICE_AI_TOOL_SECRET?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected ?? "");
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Corps absent : on répond avec les valeurs par défaut pour ne jamais bloquer l'appel.
  }

  const calledNumber = String(body.called_number ?? "").trim();
  const db = createSupabaseServiceRoleClient();
  if (!db || !calledNumber) return initResponse(FALLBACK);

  const artisanId = await resolveArtisanIdByCalledNumber(db, calledNumber);
  if (!artisanId) return initResponse(FALLBACK);

  const [{ data: profile }, quota] = await Promise.all([
    db.from("profiles").select("business_name, name").eq("id", artisanId).maybeSingle(),
    resolveVoiceQuota(db, artisanId),
  ]);

  const businessName = (profile?.business_name as string | null)?.trim() || FALLBACK.business_name;
  const artisanName = (profile?.name as string | null)?.trim() || businessName;

  return initResponse({
    business_name: businessName,
    artisan_name: artisanName,
    accepts_calls: quota && !quota.canAcceptCalls ? "false" : "true",
  });
}
