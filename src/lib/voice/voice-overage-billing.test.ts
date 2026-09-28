import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/stripe/server", () => ({ getStripe: vi.fn(), isStripeConfigured: () => false }));
vi.mock("@/lib/voice/subscription-voice-number-sync", () => ({ syncSubscriptionVoiceNumber: vi.fn() }));

import { computeOverageAmountCents } from "./voice-overage-billing";

describe("computeOverageAmountCents", () => {
  it("rien à facturer dans le forfait", () => {
    expect(computeOverageAmountCents({ callsIncluded: 40, callsUsed: 38, unitCents: 90, capCents: 3000 })).toEqual({
      overageCalls: 0,
      amountCents: 0,
    });
  });

  it("facture les appels hors forfait au prix unitaire", () => {
    expect(computeOverageAmountCents({ callsIncluded: 40, callsUsed: 50, unitCents: 90, capCents: 3000 })).toEqual({
      overageCalls: 10,
      amountCents: 900,
    });
  });

  it("ne dépasse jamais le plafond", () => {
    expect(computeOverageAmountCents({ callsIncluded: 100, callsUsed: 200, unitCents: 70, capCents: 3000 })).toEqual({
      overageCalls: 100,
      amountCents: 3000,
    });
  });
});
