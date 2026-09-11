import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveVoiceQuota } from "@/lib/voice/resolve-voice-quota";

export type VoiceContext = {
  artisanId: string;
  db: SupabaseClient;
  body: Record<string, unknown>;
  callerNumber: string | null;
};

export type VoiceResolveResult =
  | { ok: true; ctx: VoiceContext }
  | { ok: false; response: NextResponse };

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

type ResolveVoiceContextOptions = {
  /** Refuse les tools si le quota est épuisé et que l'artisan a désactivé le dépassement. */
  enforceQuota?: boolean;
};

export async function resolveVoiceContext(
  request: Request,
  options: ResolveVoiceContextOptions = {},
): Promise<VoiceResolveResult> {
  const enforceQuota = options.enforceQuota ?? true;
  const expected = process.env.VOICE_AI_TOOL_SECRET;
  if (!expected) {
    return { ok: false, response: NextResponse.json({ error: "Voice AI non configuré" }, { status: 503 }) };
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!provided || !timingSafeEqualStrings(provided, expected)) {
    return { ok: false, response: unauthorized("Non autorisé") };
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Corps invalide" }, { status: 400 }) };
  }

  const calledNumber = String(body.called_number ?? body.to ?? body.phone ?? "").trim();
  if (!calledNumber) {
    return { ok: false, response: NextResponse.json({ error: "Numéro appelé manquant" }, { status: 400 }) };
  }

  const client = createSupabaseServiceRoleClient();
  if (!client) {
    return { ok: false, response: NextResponse.json({ error: "Configuration serveur manquante" }, { status: 500 }) };
  }

  const { data: mapping } = await client
    .from("artisan_voice_numbers")
    .select("artisan_id, is_active")
    .eq("phone_e164", calledNumber)
    .maybeSingle();

  if (!mapping || !(mapping.is_active as boolean)) {
    return { ok: false, response: NextResponse.json({ error: "Numéro non rattaché" }, { status: 404 }) };
  }

  const artisanId = mapping.artisan_id as string;

  if (enforceQuota) {
    const quota = await resolveVoiceQuota(client, artisanId);
    if (quota && !quota.canAcceptCalls) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "voice_quota_exhausted",
            message:
              "Le quota mensuel Soline de cet artisan est épuisé et il a choisi de ne pas dépasser son forfait. Informez l'appelant qu'il peut rappeler le mois prochain ou laisser un message sur la ligne directe de l'artisan.",
            quota: {
              included: quota.voiceMinutesIncluded,
              used: quota.voiceMinutesUsed,
              remaining: quota.remainingMinutes,
              period_end: quota.periodEnd,
            },
          },
          { status: 403 },
        ),
      };
    }
  }

  return {
    ok: true,
    ctx: {
      artisanId,
      db: client,
      body,
      callerNumber: String(body.caller_number ?? body.from ?? "").trim() || null,
    },
  };
}
