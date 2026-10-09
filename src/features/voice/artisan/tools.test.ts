import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications/notify-events", () => ({ notifyNewAppointment: vi.fn() }));
vi.mock("@/lib/sms/send-sms", () => ({ sendTransactionalSms: vi.fn() }));

import { createFakeDb } from "@/test-utils/fake-supabase";

import { artisanScheduleAppointment } from "./tools";

const A = "artisan-A";
const CONV = "conv_0123456789abcdef";

function setup() {
  return createFakeDb({
    profiles: [{ id: A, visit_hours: { "1": [{ start: "08:00", end: "18:00" }] }, visit_duration_minutes: 60, business_name: "X" }],
    appointments: [],
    voice_call_sessions: [{ conversation_id: CONV, artisan_id: "artisan-B", started_at: new Date().toISOString() }],
  });
}

const body = (extra: Record<string, unknown> = {}) => ({
  customer_name: "Mme Martin",
  start_time: "2026-10-13T07:00:00.000Z",
  ...extra,
});

afterEach(() => {
  delete process.env.SOLINE_REQUIRE_VERIFIED_CALL;
});

describe("outil réserver : identité de l'appel", () => {
  it("conversation appartenant à un autre artisan que le numéro appelé : refus, rien d'écrit", async () => {
    const { db, tables } = setup();
    const res = await artisanScheduleAppointment(db, A, { body: body({ conversation_id: CONV }), callerNumber: "+33612345678", mode: "full" });
    expect(res).toMatchObject({ ok: false, error: "unverified_call" });
    expect(tables.appointments).toHaveLength(0);
  });

  it("mode strict (SOLINE_REQUIRE_VERIFIED_CALL=1) : sans conversation vérifiée, aucune réservation", async () => {
    process.env.SOLINE_REQUIRE_VERIFIED_CALL = "1";
    const { db, tables } = setup();
    const res = await artisanScheduleAppointment(db, A, { body: body(), callerNumber: "+33612345678", mode: "full" });
    expect(res).toMatchObject({ ok: false, error: "unverified_call" });
    expect(tables.appointments).toHaveLength(0);
  });
});
