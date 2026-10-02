import { describe, expect, it } from "vitest";

import { normalizePhoneE164 } from "@/lib/phone";
import { computeTwilioMinutesBilled } from "@/lib/voice/twilio-minutes";
import { detectVoiceQuotaThreshold } from "@/lib/voice/voice-quota-alerts";

describe("computeTwilioMinutesBilled", () => {
  it("décompte 1 minute pour 12 secondes (minute entamée)", () => {
    expect(computeTwilioMinutesBilled("completed", 12)).toBe(1);
  });

  it("décompte 2 minutes pour 64 secondes", () => {
    expect(computeTwilioMinutesBilled("completed", 64)).toBe(2);
  });

  it("décompte 1 minute pour 60 secondes exactes", () => {
    expect(computeTwilioMinutesBilled("completed", 60)).toBe(1);
  });

  it("retourne 0 si l'appel n'est pas completed", () => {
    expect(computeTwilioMinutesBilled("no-answer", 120)).toBe(0);
    expect(computeTwilioMinutesBilled("busy", 45)).toBe(0);
    expect(computeTwilioMinutesBilled("failed", 45)).toBe(0);
  });

  it("retourne 0 si CallDuration vaut 0", () => {
    expect(computeTwilioMinutesBilled("completed", 0)).toBe(0);
    expect(computeTwilioMinutesBilled("completed", "0")).toBe(0);
  });
});

describe("normalizePhoneE164", () => {
  it("convertit un numéro français local", () => {
    expect(normalizePhoneE164("06 12 34 56 78")).toBe("+33612345678");
  });

  it("conserve un numéro déjà en E.164", () => {
    expect(normalizePhoneE164("+33123456789")).toBe("+33123456789");
  });
});

describe("detectVoiceQuotaThreshold", () => {
  it("aucun seuil si aucun appel inclus", () => {
    expect(detectVoiceQuotaThreshold({ included: 0, previousUsed: 0, newUsed: 10 })).toBeNull();
  });

  it("détecte 80 % puis 100 %", () => {
    expect(detectVoiceQuotaThreshold({ included: 40, previousUsed: 31, newUsed: 32 })).toBe("80");
    expect(detectVoiceQuotaThreshold({ included: 40, previousUsed: 39, newUsed: 40 })).toBe("100");
    expect(detectVoiceQuotaThreshold({ included: 40, previousUsed: 40, newUsed: 41 })).toBeNull();
  });
});
