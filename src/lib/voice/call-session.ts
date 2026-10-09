import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingSchemaObject } from "@/lib/supabase/schema-compat";

/**
 * Session d'appel Soline (table voice_call_sessions, migration 63).
 *
 * Le webhook d'initiation enregistre conversation_id → artisan (résolu par le numéro appelé).
 * Les outils ne font confiance à un conversation_id que s'il est enregistré ici POUR CET
 * artisan : c'est ce qui permet le rejeu idempotent et la modification d'un RDV de la même
 * conversation, sans jamais toucher à une autre demande ni à un autre artisan.
 * started_at (horloge serveur, avant le décroché) donne un temps d'appel prudent.
 */

type Db = SupabaseClient;

/** Coupure dure côté ElevenLabs (Advanced › Max conversation duration). Garde-fou final. */
export const VOICE_CALL_MAX_SECS = 480;
/** À partir d'ici, les outils demandent à l'agent de conclure. */
export const VOICE_CALL_CLOSING_AT_SECS = 420;

const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function normalizeConversationId(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  return CONVERSATION_ID_PATTERN.test(value) ? value : null;
}

export type CallSession =
  | { verified: true; conversationId: string; startedAt: Date }
  | {
      verified: false;
      /**
       * artisan_mismatch : la conversation existe mais pour un AUTRE artisan que celui du
       * numéro appelé transmis à l'outil (paramètre falsifié ou mal configuré) → refus.
       */
      reason: "missing_id" | "unknown_conversation" | "artisan_mismatch" | "schema_missing" | "lookup_failed";
    };

/**
 * `SOLINE_REQUIRE_VERIFIED_CALL=1` (à activer une fois les outils ElevenLabs configurés avec
 * conversation_id) : aucune réservation sans conversation vérifiée.
 */
export function verifiedCallRequired(): boolean {
  return process.env.SOLINE_REQUIRE_VERIFIED_CALL?.trim() === "1";
}

/** Webhook d'initiation : jamais bloquant (une erreur est journalisée, l'appel continue). */
export async function recordCallSession(
  db: Db,
  input: { conversationId: unknown; artisanId: string; callSid?: unknown; callerNumber?: unknown },
): Promise<boolean> {
  const conversationId = normalizeConversationId(input.conversationId);
  if (!conversationId) return false;
  const { error } = await db.from("voice_call_sessions").upsert(
    {
      conversation_id: conversationId,
      artisan_id: input.artisanId,
      call_sid: typeof input.callSid === "string" ? input.callSid.slice(0, 64) : null,
      caller_number: typeof input.callerNumber === "string" ? input.callerNumber.slice(0, 32) : null,
    },
    { onConflict: "conversation_id", ignoreDuplicates: true },
  );
  if (error) {
    if (isMissingSchemaObject(error, "voice_call_sessions")) {
      console.warn("[voice session] table voice_call_sessions absente (migration 63 à appliquer)");
    } else {
      console.error("[voice session] enregistrement", error.code, error.message);
    }
    return false;
  }
  return true;
}

/** Outils : conversation reconnue seulement si elle appartient à l'artisan du numéro appelé. */
export async function resolveCallSession(db: Db, artisanId: string, rawConversationId: unknown): Promise<CallSession> {
  const conversationId = normalizeConversationId(rawConversationId);
  if (!conversationId) return { verified: false, reason: "missing_id" };
  const { data, error } = await db
    .from("voice_call_sessions")
    .select("conversation_id, artisan_id, started_at")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) {
    if (isMissingSchemaObject(error, "voice_call_sessions")) return { verified: false, reason: "schema_missing" };
    console.error("[voice session] lecture", error.code, error.message);
    return { verified: false, reason: "lookup_failed" };
  }
  if (!data) {
    console.warn("[voice session] conversation inconnue", { conversationId });
    return { verified: false, reason: "unknown_conversation" };
  }
  if (data.artisan_id !== artisanId) {
    console.warn("[voice session] conversation d'un autre artisan que le numéro appelé", { conversationId });
    return { verified: false, reason: "artisan_mismatch" };
  }
  return { verified: true, conversationId, startedAt: new Date(data.started_at as string) };
}

export type CallTimeInfo = {
  elapsed_secs: number;
  remaining_secs: number;
  /** Présent une seule fois par appel, au premier outil appelé après VOICE_CALL_CLOSING_AT_SECS. */
  closing_instruction?: string;
};

export const CLOSING_INSTRUCTION =
  "Il reste moins d'une minute d'appel. Ne pose plus de nouvelle question : vérifie seulement le nom et le numéro de rappel s'ils manquent, résume en une phrase la demande et le statut réel du rendez-vous (aucun, ou à confirmer par l'artisan), puis termine avec end_call.";

/**
 * Temps d'appel à joindre aux réponses des outils. Le signal de clôture n'est émis qu'une
 * fois (marqué en base de façon atomique) ; la coupure à 480 s reste le garde-fou.
 */
export async function callTimeInfo(db: Db, artisanId: string, session: CallSession, now = new Date()): Promise<CallTimeInfo | null> {
  if (!session.verified) return null;
  const elapsed = Math.max(0, Math.floor((now.getTime() - session.startedAt.getTime()) / 1000));
  const info: CallTimeInfo = { elapsed_secs: elapsed, remaining_secs: Math.max(0, VOICE_CALL_MAX_SECS - elapsed) };
  if (elapsed < VOICE_CALL_CLOSING_AT_SECS) return info;
  const { data, error } = await db.rpc("voice_mark_closing_signal", {
    p_conversation_id: session.conversationId,
    p_artisan_id: artisanId,
  });
  if (error) {
    console.error("[voice session] signal de clôture", error.code, error.message);
    return info;
  }
  return data === true ? { ...info, closing_instruction: CLOSING_INSTRUCTION } : info;
}

/** Fin d'appel (webhook post-appel) : la session n'a plus d'usage. Idempotent. */
export async function endCallSession(db: Db, rawConversationId: unknown): Promise<void> {
  const conversationId = normalizeConversationId(rawConversationId);
  if (!conversationId) return;
  const { error } = await db.from("voice_call_sessions").delete().eq("conversation_id", conversationId);
  if (error && !isMissingSchemaObject(error, "voice_call_sessions")) {
    console.error("[voice session] suppression", error.code, error.message);
  }
}

/** Cron : sessions orphelines (post-appel jamais reçu). */
export async function purgeStaleCallSessions(db: Db, now = new Date()): Promise<void> {
  const before = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const { error } = await db.from("voice_call_sessions").delete().lt("started_at", before);
  if (error && !isMissingSchemaObject(error, "voice_call_sessions")) {
    console.error("[voice session] purge", error.code, error.message);
  }
}
