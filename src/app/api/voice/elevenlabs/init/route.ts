import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveVoiceQuota } from "@/lib/voice/resolve-voice-quota";
import { findTrade, findTradeCategory } from "@/lib/trades/taxonomy";
import { normalizePhoneE164 } from "@/lib/voice/twilio-minutes";

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
  /** Nom complet « Prénom Nom » — à privilégier dans le message d'accueil. */
  artisan_name: "l'artisan",
  /** Prénom seul, pour le prompt (« Jean vous rappellera »). Jamais vide. */
  artisan_prenom: "l'artisan",
  /** Nom de famille seul. Jamais vide. */
  artisan_nom: "l'artisan",
  /** Métier précis (ex. « Chauffagiste »), pour cadrer les questions de l'agent. */
  artisan_metier: "artisan du bâtiment",
  /** Grande famille de métier (ex. « Plomberie, chauffage & climatisation »). */
  artisan_domaine: "bâtiment",
  /** Prestations proposées (catalogue), séparées par des virgules. */
  artisan_prestations: "non précisées",
  /** Ville de l'entreprise (zone d'intervention approximative). */
  artisan_zone: "non précisée",
  accepts_calls: "true",
};

const MAX_PRESTATIONS_CHARS = 600;

/** Tolère les variantes de saisie : guillemets, « Bearer », « Bearer: », espaces. */
function normalizeSecret(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^bearer\s*:?\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function initResponse(dynamicVariables: Record<string, string>) {
  return NextResponse.json({
    type: "conversation_initiation_client_data",
    dynamic_variables: dynamicVariables,
  });
}

export async function POST(request: Request) {
  const expected = normalizeSecret(process.env.VOICE_AI_TOOL_SECRET);
  const rawHeader = request.headers.get("authorization");
  const provided = normalizeSecret(rawHeader);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
    // Diagnostic sans jamais journaliser le secret : présence, préfixe, longueurs.
    console.warn("[elevenlabs init] 401", {
      headerPresent: rawHeader != null,
      bearerPrefix: /^\s*"?bearer/i.test(rawHeader ?? ""),
      providedLength: provided.length,
      expectedLength: expected.length,
      expectedConfigured: expected.length > 0,
    });
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Corps absent : on répond avec les valeurs par défaut pour ne jamais bloquer l'appel.
  }

  // Ne JAMAIS faire échouer l'appel : toute erreur → valeurs par défaut (HTTP 200).
  // Un 500 ici = ElevenLabs refuse la conversation et Twilio joue un message d'erreur.
  try {
    return initResponse(await resolveDynamicVariables(body));
  } catch (error) {
    console.error("[elevenlabs init] erreur, valeurs par défaut renvoyées", {
      calledNumber: body.called_number,
      error: error instanceof Error ? `${error.message}\n${error.stack}` : error,
    });
    return initResponse(FALLBACK);
  }
}

async function resolveDynamicVariables(body: Record<string, unknown>): Promise<Record<string, string>> {
  const calledNumber = normalizePhoneE164(String(body.called_number ?? ""));
  const db = createSupabaseServiceRoleClient();
  if (!db || !calledNumber) {
    console.warn("[elevenlabs init] numéro appelé ou service role absent", { hasDb: !!db, calledNumber });
    return FALLBACK;
  }

  const { data: mapping, error: mappingError } = await db
    .from("artisan_voice_numbers")
    .select("artisan_id, is_active")
    .eq("phone_e164", calledNumber)
    .maybeSingle();
  if (mappingError) console.error("[elevenlabs init] lookup numéro", mappingError.message);
  if (!mapping?.artisan_id || !mapping.is_active) {
    console.warn("[elevenlabs init] numéro non rattaché", { calledNumber });
    return FALLBACK;
  }
  const artisanId = mapping.artisan_id as string;

  const [{ data: profile }, { data: services }, quota] = await Promise.all([
    db
      .from("profiles")
      .select("business_name, name, first_name, last_name, trade_category, trade, city")
      .eq("id", artisanId)
      .maybeSingle(),
    db.from("services").select("title").eq("artisan_id", artisanId).order("title", { ascending: true }).limit(40),
    resolveVoiceQuota(db, artisanId).catch(() => null),
  ]);

  const businessName = (profile?.business_name as string | null)?.trim() || FALLBACK.business_name;
  const firstName = (profile?.first_name as string | null)?.trim() || "";
  const lastName = (profile?.last_name as string | null)?.trim() || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || (profile?.name as string | null)?.trim() || "";
  // Chaque variable a une valeur de repli : une variable vide ou absente fait
  // échouer la conversation côté ElevenLabs.
  const artisanName = fullName || businessName;

  const category = findTradeCategory(profile?.trade_category as string | null);
  const trade = findTrade(profile?.trade_category as string | null, profile?.trade as string | null);

  let prestations = "";
  for (const title of (services ?? []).map((s) => String(s.title ?? "").trim()).filter(Boolean)) {
    const next = prestations ? `${prestations}, ${title}` : title;
    if (next.length > MAX_PRESTATIONS_CHARS) break;
    prestations = next;
  }

  return {
    business_name: businessName,
    artisan_name: artisanName,
    artisan_metier: trade?.label ?? category?.label ?? FALLBACK.artisan_metier,
    artisan_domaine: category?.label ?? FALLBACK.artisan_domaine,
    artisan_prestations: prestations || FALLBACK.artisan_prestations,
    artisan_zone: (profile?.city as string | null)?.trim() || FALLBACK.artisan_zone,
    artisan_prenom: firstName || artisanName,
    artisan_nom: lastName || artisanName,
    accepts_calls: quota && !quota.canAcceptCalls ? "false" : "true",
  };
}
