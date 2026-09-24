import { describe, expect, it } from "vitest";

import { buildVoiceNumberArtisanSnapshot } from "@/lib/voice/voice-number-registry";

describe("buildVoiceNumberArtisanSnapshot", () => {
  it("fige l'identité légale au moment du rattachement", () => {
    const snap = buildVoiceNumberArtisanSnapshot(
      {
        id: "p1",
        user_id: "u1",
        business_name: "Dupont SARL",
        name: "Jean Dupont",
        siret: "73282932000074",
        siren: "732829320",
        vat_number: "FR44732829320",
        address_line1: "1 rue Test",
        address_line2: null,
        postal_code: "75001",
        city: "Paris",
        phone: "0612345678",
        registration_ip: "203.0.113.10",
        registration_recorded_at: "2026-01-01T12:00:00.000Z",
      },
      "artisan@example.com",
    );

    expect(snap.email).toBe("artisan@example.com");
    expect(snap.siret).toBe("73282932000074");
    expect(snap.registration_ip).toBe("203.0.113.10");
    expect(snap.captured_at).toMatch(/^\d{4}-/);
  });
});
