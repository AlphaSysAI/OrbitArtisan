import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveVoiceQuota } from "@/lib/voice/resolve-voice-quota";
import { verifyVoiceToolSecret } from "@/lib/voice/voice-secret";
import type { SolineVoiceMode } from "@/lib/voice/voice-quota-types";
import { normalizePhoneE164 } from "@/lib/phone";

type VoiceContext = {
  artisanId: string;
  db: SupabaseClient;
  body: Record<string, unknown>;
  callerNumber: string | null;
  mode: SolineVoiceMode;
};

type VoiceResolveResult =
  | { ok: true; ctx: VoiceContext }
  | { ok: false; response: NextResponse };

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

type ResolveVoiceContextOptions = {
  /** Calcule le mode Soline (complet / message seul) et l'expose dans le contexte. */
  withQuota?: boolean;
};

export async function resolveVoiceContext(
  request: Request,
  options: ResolveVoiceContextOptions = {},
): Promise<VoiceResolveResult> {
  const withQuota = options.withQuota ?? true;
  const auth = verifyVoiceToolSecret(request.headers.get("authorization"));
  if (!auth.configured) {
    return { ok: false, response: NextResponse.json({ error: "Voice AI non configuré" }, { status: 503 }) };
  }
  if (!auth.ok) {
    console.warn("[voice tools] 401", { path: new URL(request.url).pathname, ...auth.diagnostic });
    return { ok: false, response: unauthorized("Non autorisé") };
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Corps invalide" }, { status: 400 }) };
  }

  const calledNumber = normalizePhoneE164(String(body.called_number ?? body.to ?? body.phone ?? ""));
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

  // Soline ne coupe jamais la ligne : au-delà du forfait et du plafond, elle passe en
  // « message seul ». Les tools qui engagent l'artisan (RDV) le vérifient via ctx.mode.
  let mode: SolineVoiceMode = "full";
  if (withQuota) {
    const quota = await resolveVoiceQuota(client, artisanId);
    mode = quota?.mode ?? "message_only";
  }

  return {
    ok: true,
    ctx: {
      artisanId,
      db: client,
      body,
      callerNumber: String(body.caller_number ?? body.from ?? "").trim() || null,
      mode,
    },
  };
}
