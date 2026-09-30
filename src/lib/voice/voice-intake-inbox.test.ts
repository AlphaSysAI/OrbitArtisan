import { describe, expect, it } from "vitest";

import {
  buildVoiceInboxSearch,
  matchVoiceAppointments,
  parseVoiceInboxLimit,
  parseVoiceInboxTab,
} from "./voice-intake-inbox";

describe("parseVoiceInboxTab", () => {
  it("défaut à traiter", () => {
    expect(parseVoiceInboxTab(undefined)).toBe("a_traiter");
    expect(parseVoiceInboxTab("n'importe")).toBe("a_traiter");
    expect(parseVoiceInboxTab("archives")).toBe("archives");
  });
});

describe("parseVoiceInboxLimit", () => {
  it("borne et arrondit", () => {
    expect(parseVoiceInboxLimit(undefined)).toBe(30);
    expect(parseVoiceInboxLimit("45")).toBe(60);
    expect(parseVoiceInboxLimit("99999")).toBe(300);
    expect(parseVoiceInboxLimit("-3")).toBe(30);
  });
});

describe("buildVoiceInboxSearch", () => {
  it("numéro français → chiffres sans préfixe", () => {
    expect(buildVoiceInboxSearch("06 12 34")).toEqual({ text: null, phoneDigits: "61234" });
    expect(buildVoiceInboxSearch("+33 6 12")).toEqual({ text: null, phoneDigits: "612" });
  });
  it("texte assaini pour PostgREST", () => {
    expect(buildVoiceInboxSearch("Dupont,user_id.eq.x")).toEqual({ text: "Dupont user_id_eq_x", phoneDigits: null });
    expect(buildVoiceInboxSearch("fuite chaudière")).toEqual({ text: "fuite chaudière", phoneDigits: null });
    expect(buildVoiceInboxSearch("jean@free.fr")).toEqual({ text: "jean@free_fr", phoneDigits: null });
    expect(buildVoiceInboxSearch("   ")).toEqual({ text: null, phoneDigits: null });
  });
});

describe("matchVoiceAppointments", () => {
  it("associe par numéro et fenêtre d'une heure", () => {
    const intakes = [
      { id: "i1", from_number: "+33612345678", created_at: "2026-09-30T10:05:00Z" },
      { id: "i2", from_number: "+33700000000", created_at: "2026-09-30T10:05:00Z" },
    ];
    const appts = [
      { id: "a1", customer_phone: "+33612345678", created_at: "2026-09-30T10:03:00Z", start_time: "2026-10-02T08:00:00Z" },
      { id: "a2", customer_phone: "+33700000000", created_at: "2026-09-28T10:03:00Z", start_time: "2026-10-02T08:00:00Z" },
    ];
    const m = matchVoiceAppointments(intakes, appts);
    expect(m.get("i1")?.id).toBe("a1");
    expect(m.has("i2")).toBe(false);
  });
});
