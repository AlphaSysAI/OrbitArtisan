import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const notify = vi.fn();
vi.mock("@/lib/notifications/notify-events", () => ({ notifyNewAppointment: (...args: unknown[]) => notify(...args) }));
vi.mock("@/lib/sms/send-sms", () => ({ sendTransactionalSms: vi.fn() }));

import { createFakeDb } from "@/test-utils/fake-supabase";

import { bookVoiceAppointment, getVoiceBookingSlots } from "./voice-booking";

const ARTISAN = "artisan-A";
// Lundi 12 octobre 2026, 8 h à Paris (UTC+2).
const NOW = new Date("2026-10-12T06:00:00.000Z");
const ALL_DAY = [{ start: "08:00", end: "18:00" }];
const PROFILE = {
  id: ARTISAN,
  business_name: "Dupont Plomberie",
  visit_duration_minutes: 60,
  visit_hours: { "1": ALL_DAY, "2": ALL_DAY, "3": ALL_DAY, "4": ALL_DAY, "5": ALL_DAY, "6": [], "7": [] },
};

function setup(appointments: Record<string, unknown>[] = [], insertError?: { code: string; message: string }) {
  return createFakeDb(
    { profiles: [{ ...PROFILE }], appointments },
    { insertError: insertError ? { appointments: insertError } : undefined, now: () => NOW },
  );
}

const PHONE = "+33612345678";

async function firstSlot(db: ReturnType<typeof setup>["db"], body: Record<string, unknown> = {}) {
  const res = await getVoiceBookingSlots(db, ARTISAN, NOW, body);
  if (!res.ok) throw new Error(res.error);
  return res;
}

beforeEach(() => notify.mockReset());

describe("disponibilités", () => {
  it("préférence « mercredi après-midi » : seulement des créneaux ce jour-là, l'après-midi (heure de Paris)", async () => {
    const { db } = setup();
    const res = await firstSlot(db, { preferred_date: "2026-10-14", part_of_day: "apres-midi" });
    expect(res.matched_preference).toBe(true);
    expect(res.slots.length).toBeGreaterThan(0);
    for (const s of res.slots) expect(s.label).toMatch(/^mercredi 14 octobre à 1[2-7] h/);
  });

  it("aucun créneau pour la préférence (samedi fermé) : le dit et propose les plus proches", async () => {
    const { db } = setup();
    const res = await firstSlot(db, { preferred_date: "2026-10-17" });
    expect(res.matched_preference).toBe(false);
    expect(res.message).toMatch(/Aucun créneau libre pour la préférence/);
    expect(res.slots).toHaveLength(3);
  });

  it("paramètres invalides ignorés (pas d'erreur, pas d'interprétation inventée)", async () => {
    const { db } = setup();
    const res = await firstSlot(db, { preferred_date: "demain", part_of_day: "soir" });
    expect(res.matched_preference).toBe(true);
    expect(res.slots).toHaveLength(3);
  });
});

describe("réservation", () => {
  it("crée un RDV en attente de validation, jamais « confirmé »", async () => {
    const { db, tables } = setup();
    const { slots } = await firstSlot(db);
    const res = await bookVoiceAppointment(
      db,
      ARTISAN,
      { body: { customer_name: "Mme Martin", start_time: slots[0]!.start_time, address: "Carcassonne" }, callerNumber: PHONE, mode: "full" },
      NOW,
    );
    expect(res).toMatchObject({ ok: true, status: "pending_validation" });
    expect(tables.appointments).toHaveLength(1);
    expect(tables.appointments[0]).toMatchObject({ status: "pending", source: "voice", artisan_id: ARTISAN });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("sans conversation vérifiée, deux demandes du même numéro : aucune annulation de la première", async () => {
    const { db, tables } = setup();
    const { slots } = await firstSlot(db);
    const base = { callerNumber: PHONE, mode: "full" as const };
    await bookVoiceAppointment(db, ARTISAN, { ...base, body: { customer_name: "Mme Martin", start_time: slots[0]!.start_time } }, NOW);
    const second = await bookVoiceAppointment(
      db,
      ARTISAN,
      { ...base, body: { customer_name: "Mme Martin", start_time: slots[1]!.start_time } },
      NOW,
    );
    expect(second.ok).toBe(true);
    expect(tables.appointments.map((x) => x.status)).toEqual(["pending", "pending"]);
  });

  it("sans conversation vérifiée, un déplacement demandé est refusé et rien n'est modifié", async () => {
    const existing = { id: "00000000-0000-4000-8000-000000000001", artisan_id: ARTISAN, status: "pending", source: "voice", start_time: "2026-10-13T07:00:00.000Z", end_time: "2026-10-13T08:00:00.000Z" };
    const { db, tables } = setup([{ ...existing }]);
    const { slots } = await firstSlot(db);
    const res = await bookVoiceAppointment(
      db,
      ARTISAN,
      {
        body: { customer_name: "Mme Martin", start_time: slots[0]!.start_time, replaces_appointment_id: existing.id },
        callerNumber: PHONE,
        mode: "full",
      },
      NOW,
    );
    expect(res).toMatchObject({ ok: false, error: "change_unavailable" });
    expect(tables.appointments).toEqual([existing]);
  });
});

describe("réservation — conversation vérifiée (arbitrage en base)", () => {
  const CONV = "conv_0123456789abcdef";
  type RpcResult = { data: unknown; error: { code: string; message: string } | null };

  function setupRpc(result: RpcResult | ((args: Record<string, unknown>) => RpcResult)) {
    return createFakeDb(
      { profiles: [{ ...PROFILE }], appointments: [] },
      { now: () => NOW, rpc: { voice_book_appointment: typeof result === "function" ? result : () => result } },
    );
  }

  async function book(db: ReturnType<typeof setupRpc>["db"], body: Record<string, unknown>) {
    const { slots } = await firstSlot(db);
    return bookVoiceAppointment(
      db,
      ARTISAN,
      { body: { customer_name: "Mme Martin", start_time: slots[0]!.start_time, ...body }, callerNumber: PHONE, mode: "full", verifiedConversationId: CONV },
      NOW,
    );
  }

  it("transmet l'identité vérifiée (artisan + conversation) ; artisan_id et statut du corps ignorés", async () => {
    let args: Record<string, unknown> = {};
    const { db } = setupRpc((a) => ((args = a), { data: { status: "created", id: "appt-1" }, error: null }));
    const res = await book(db, { artisan_id: "artisan-B", status: "confirmed", conversation_id: "conv_autre_conversation" });
    expect(res).toMatchObject({ ok: true, status: "pending_validation", appointment_id: "appt-1" });
    expect(args).toMatchObject({ p_artisan_id: ARTISAN, p_conversation_id: CONV, p_replaces_id: null, p_additional: false });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("rejeu après timeout : réservation existante renvoyée, pas de seconde notification", async () => {
    const { db } = setupRpc({ data: { status: "already_booked", id: "appt-1" }, error: null });
    const res = await book(db, {});
    expect(res).toMatchObject({ ok: true, already_booked: true, appointment_id: "appt-1", status: "pending_validation" });
    expect(notify).not.toHaveBeenCalled();
  });

  it("déplacement : même RDV, ancien créneau annoncé libéré", async () => {
    let args: Record<string, unknown> = {};
    const { db } = setupRpc((a) => ((args = a), { data: { status: "replaced", id: "appt-1", previous_start_time: "2026-10-13T07:00:00.000Z" }, error: null }));
    const res = await book(db, { replaces_appointment_id: "00000000-0000-4000-8000-000000000001" });
    expect(args.p_replaces_id).toBe("00000000-0000-4000-8000-000000000001");
    expect(res).toMatchObject({ ok: true, appointment_id: "appt-1" });
    expect(res.ok && res.previous_label).toBeTruthy();
  });

  it("déplacement vers un créneau pris : échec, l'agent est informé que l'ancien RDV est conservé", async () => {
    const { db } = setupRpc({ data: { status: "slot_unavailable" }, error: null });
    const res = await book(db, { replaces_appointment_id: "00000000-0000-4000-8000-000000000001" });
    expect(res).toMatchObject({ ok: false, error: "slot_unavailable" });
    expect(res.message).toMatch(/conservé/);
    expect(notify).not.toHaveBeenCalled();
  });

  it("nouvelle réservation alors qu'un RDV est déjà en attente dans l'appel : rien n'est écrit, question à poser", async () => {
    const { db, tables } = setupRpc({ data: { status: "existing_booking", id: "appt-1", start_time: "2026-10-13T07:00:00.000Z" }, error: null });
    const res = await book(db, {});
    expect(res).toMatchObject({ ok: false, error: "existing_booking", appointment_id: "appt-1" });
    expect(res.message).toMatch(/replaces_appointment_id/);
    expect(res.message).toMatch(/additional_visit/);
    expect(tables.appointments).toHaveLength(0);
  });

  it("seconde visite explicitement demandée : transmise telle quelle", async () => {
    let args: Record<string, unknown> = {};
    const { db } = setupRpc((a) => ((args = a), { data: { status: "created", id: "appt-2" }, error: null }));
    await book(db, { additional_visit: true });
    expect(args.p_additional).toBe(true);
  });

  it("RDV déjà validé par l'artisan ou d'une autre demande : jamais modifié", async () => {
    const locked = await book(setupRpc({ data: { status: "replace_not_pending", id: "appt-1" }, error: null }).db, {
      replaces_appointment_id: "00000000-0000-4000-8000-000000000001",
    });
    expect(locked).toMatchObject({ ok: false, error: "appointment_locked" });
    const foreign = await book(setupRpc({ data: { status: "replace_not_found" }, error: null }).db, {
      replaces_appointment_id: "00000000-0000-4000-8000-000000000009",
    });
    expect(foreign).toMatchObject({ ok: false, error: "replace_not_found" });
  });

  it("identifiant de RDV mal formé : ignoré (pas de modification), traité comme nouvelle demande", async () => {
    let args: Record<string, unknown> = {};
    const { db } = setupRpc((a) => ((args = a), { data: { status: "existing_booking", id: "appt-1" }, error: null }));
    await book(db, { replaces_appointment_id: "'; drop table appointments; --" });
    expect(args.p_replaces_id).toBeNull();
  });

  it("erreur base inattendue : échec explicite, jamais de succès annoncé", async () => {
    const { db } = setupRpc({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
    const res = await book(db, {});
    expect(res).toMatchObject({ ok: false, error: "server_error" });
    expect(res.message).toMatch(/Ne dis pas/);
  });

  it("fonction absente (migration 63 non appliquée) : création simple, sans modification", async () => {
    const missing = { data: null, error: { code: "PGRST202", message: "Could not find the function public.voice_book_appointment in the schema cache" } };
    const { db, tables } = setupRpc(missing);
    const created = await book(db, {});
    expect(created).toMatchObject({ ok: true });
    expect(tables.appointments).toHaveLength(1);
    const moved = await book(setupRpc(missing).db, { replaces_appointment_id: "00000000-0000-4000-8000-000000000001" });
    expect(moved).toMatchObject({ ok: false, error: "change_unavailable" });
  });

  it("sortie inattendue de la fonction : échec explicite", async () => {
    const { db } = setupRpc({ data: { status: "ok" }, error: null });
    expect(await book(db, {})).toMatchObject({ ok: false, error: "server_error" });
  });
});

describe("réservation — préconditions", () => {
  it("créneau inventé par le modèle (hors disponibilités) : refusé", async () => {
    const { db, tables } = setup();
    const res = await bookVoiceAppointment(
      db,
      ARTISAN,
      { body: { customer_name: "Mme Martin", start_time: "2026-10-12T21:00:00.000Z" }, callerNumber: PHONE, mode: "full" },
      NOW,
    );
    expect(res).toMatchObject({ ok: false, error: "slot_unavailable" });
    expect(tables.appointments).toHaveLength(0);
  });

  it("réservation concurrente (contrainte d'exclusion) : slot_unavailable, pas de succès annoncé", async () => {
    const { db } = setup([], { code: "23P01", message: "conflicting key value violates exclusion constraint" });
    const { slots } = await firstSlot(db);
    const res = await bookVoiceAppointment(
      db,
      ARTISAN,
      { body: { customer_name: "Mme Martin", start_time: slots[0]!.start_time }, callerNumber: PHONE, mode: "full" },
      NOW,
    );
    expect(res).toMatchObject({ ok: false, error: "slot_unavailable" });
    expect(notify).not.toHaveBeenCalled();
  });

  it("paramètres invalides (nom vide, téléphone illisible) : missing_fields", async () => {
    const { db } = setup();
    const { slots } = await firstSlot(db);
    const res = await bookVoiceAppointment(
      db,
      ARTISAN,
      { body: { customer_name: " ", start_time: slots[0]!.start_time, customer_phone: "abc" }, callerNumber: null, mode: "full" },
      NOW,
    );
    expect(res).toMatchObject({ ok: false, error: "missing_fields" });
  });

  it("forfait épuisé (message seul) : aucune réservation, même si le modèle insiste", async () => {
    const { db, tables } = setup();
    const res = await bookVoiceAppointment(
      db,
      ARTISAN,
      { body: { customer_name: "Mme Martin", start_time: "2026-10-13T08:00:00.000Z" }, callerNumber: PHONE, mode: "message_only" },
      NOW,
    );
    expect(res).toMatchObject({ ok: false, error: "message_only" });
    expect(tables.appointments).toHaveLength(0);
  });

  it("un artisan_id glissé dans le corps est ignoré : le RDV va à l'artisan du numéro appelé", async () => {
    const { db, tables } = setup();
    const { slots } = await firstSlot(db);
    await bookVoiceAppointment(
      db,
      ARTISAN,
      {
        body: { customer_name: "Mme Martin", start_time: slots[0]!.start_time, artisan_id: "artisan-B" },
        callerNumber: PHONE,
        mode: "full",
      },
      NOW,
    );
    expect(tables.appointments[0]!.artisan_id).toBe(ARTISAN);
  });
});
