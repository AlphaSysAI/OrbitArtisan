import { describe, expect, it } from "vitest";

import { createFakeDb } from "@/test-utils/fake-supabase";

import {
  CLOSING_INSTRUCTION,
  callTimeInfo,
  endCallSession,
  normalizeConversationId,
  recordCallSession,
  resolveCallSession,
} from "./call-session";

const A = "artisan-A";
const B = "artisan-B";
const CONV = "conv_0123456789abcdef";
const START = new Date("2026-10-12T08:00:00.000Z");
const at = (secs: number) => new Date(START.getTime() + secs * 1000);

function setup(sessions: Record<string, unknown>[] = [], closing: boolean[] = [true, false]) {
  return createFakeDb(
    { voice_call_sessions: sessions },
    { rpc: { voice_mark_closing_signal: () => ({ data: closing.shift() ?? false, error: null }) } },
  );
}

describe("identifiant de conversation", () => {
  it("format accepté / refusé (pas d'injection dans les filtres)", () => {
    expect(normalizeConversationId(CONV)).toBe(CONV);
    expect(normalizeConversationId("  " + CONV + " ")).toBe(CONV);
    expect(normalizeConversationId("x")).toBeNull();
    expect(normalizeConversationId("conv_1,artisan_id.eq.B")).toBeNull();
    expect(normalizeConversationId(42)).toBeNull();
  });
});

describe("session d'appel", () => {
  it("enregistrée par le webhook d'initiation puis reconnue pour cet artisan uniquement", async () => {
    const { db } = setup();
    expect(await recordCallSession(db, { conversationId: CONV, artisanId: A, callSid: "CA1" })).toBe(true);
    expect(await resolveCallSession(db, A, CONV)).toMatchObject({ verified: true, conversationId: CONV });
    // Un conversation_id d'un autre artisan (ou inventé) n'ouvre aucun droit.
    expect(await resolveCallSession(db, B, CONV)).toEqual({ verified: false, reason: "artisan_mismatch" });
    expect(await resolveCallSession(db, A, "conv_inventee_par_le_modele")).toEqual({ verified: false, reason: "unknown_conversation" });
    expect(await resolveCallSession(db, A, undefined)).toEqual({ verified: false, reason: "missing_id" });
  });

  it("table absente (migration 63 non appliquée) : non vérifiée, sans exception", async () => {
    const missing = { code: "PGRST205", message: "Could not find the table 'public.voice_call_sessions' in the schema cache" };
    const db = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: missing }) }) }) }),
    } as unknown as Parameters<typeof resolveCallSession>[0];
    expect(await resolveCallSession(db, A, CONV)).toEqual({ verified: false, reason: "schema_missing" });
  });

  it("fin d'appel : session supprimée, suppression rejouable", async () => {
    const { db, tables } = setup([{ conversation_id: CONV, artisan_id: A, started_at: START.toISOString() }]);
    await endCallSession(db, CONV);
    await endCallSession(db, CONV);
    expect(tables.voice_call_sessions).toHaveLength(0);
  });
});

describe("temps d'appel et clôture", () => {
  const session = { verified: true as const, conversationId: CONV, startedAt: START };

  it("avant 420 s : temps écoulé/restant, pas de consigne de clôture", async () => {
    const { db } = setup();
    expect(await callTimeInfo(db, A, session, at(300))).toEqual({ elapsed_secs: 300, remaining_secs: 180 });
  });

  it("après 420 s : consigne de clôture une seule fois, puis seulement le temps restant", async () => {
    const { db } = setup();
    const first = await callTimeInfo(db, A, session, at(425));
    const second = await callTimeInfo(db, A, session, at(440));
    expect(first).toEqual({ elapsed_secs: 425, remaining_secs: 55, closing_instruction: CLOSING_INSTRUCTION });
    expect(second).toEqual({ elapsed_secs: 440, remaining_secs: 40 });
  });

  it("au-delà de 480 s : restant borné à 0", async () => {
    const { db } = setup([], [false]);
    expect(await callTimeInfo(db, A, session, at(600))).toMatchObject({ remaining_secs: 0 });
  });

  it("session non vérifiée : aucune information de temps (jamais de valeur inventée)", async () => {
    const { db } = setup();
    expect(await callTimeInfo(db, A, { verified: false, reason: "missing_id" }, at(450))).toBeNull();
  });

  it("la consigne demande de résumer le statut réel du RDV et de conclure", () => {
    expect(CLOSING_INSTRUCTION).toMatch(/statut réel/);
    expect(CLOSING_INSTRUCTION).toMatch(/end_call/);
  });
});
