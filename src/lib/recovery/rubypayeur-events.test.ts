import { afterEach, describe, expect, it, vi } from "vitest";

import { computeOurCommission } from "@/lib/services/rubypayeur";

import {
  isKnownRubypayeurEvent,
  mapCaseStatusToRecoveryStatus,
  resolveCaseStatus,
  RubypayeurWebhookSchema,
} from "./rubypayeur-events";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveCaseStatus", () => {
  it("déduit le statut de l'événement", () => {
    expect(resolveCaseStatus({ event: "case.collected" })).toBe("collected");
    expect(resolveCaseStatus({ event: "case.partially_collected" })).toBe("partially_collected");
    expect(resolveCaseStatus({ event: "case.failed" })).toBe("failed");
  });

  it("retombe sur le champ status pour un événement inconnu", () => {
    expect(resolveCaseStatus({ event: "case.whatever", status: "paid" })).toBe("collected");
  });
});

describe("mapCaseStatusToRecoveryStatus", () => {
  it("projette le dossier sur le statut de la facture", () => {
    expect(mapCaseStatusToRecoveryStatus("submitted")).toBe("submitted_to_collection");
    expect(mapCaseStatusToRecoveryStatus("in_progress")).toBe("in_progress");
    expect(mapCaseStatusToRecoveryStatus("partially_collected")).toBe("in_progress");
    expect(mapCaseStatusToRecoveryStatus("collected")).toBe("collected");
    expect(mapCaseStatusToRecoveryStatus("canceled")).toBe("failed");
  });
});

describe("isKnownRubypayeurEvent", () => {
  it("filtre les événements hors périmètre", () => {
    expect(isKnownRubypayeurEvent("case.collected")).toBe(true);
    expect(isKnownRubypayeurEvent("invoice.something")).toBe(false);
  });
});

describe("RubypayeurWebhookSchema", () => {
  it("normalise les montants transmis en chaîne", () => {
    const parsed = RubypayeurWebhookSchema.safeParse({
      event: "case.collected",
      case_id: "rp_42",
      amount_collected: "1200,50",
      fee: "180.00",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.amount_collected).toBe(1200.5);
    expect(parsed.success && parsed.data.fee).toBe(180);
  });

  it("exige un identifiant de dossier ou une référence externe", () => {
    expect(RubypayeurWebhookSchema.safeParse({ event: "case.collected" }).success).toBe(false);
  });
});

describe("computeOurCommission", () => {
  it("applique 20 % des honoraires par défaut", () => {
    expect(computeOurCommission(180)).toBe(36);
  });

  it("respecte RUBYPAYEUR_COMMISSION_RATE", () => {
    vi.stubEnv("RUBYPAYEUR_COMMISSION_RATE", "0.15");
    expect(computeOurCommission(200)).toBe(30);
  });

  it("ignore un taux invalide et retombe sur 20 %", () => {
    vi.stubEnv("RUBYPAYEUR_COMMISSION_RATE", "abc");
    expect(computeOurCommission(100)).toBe(20);
  });

  it("retourne zéro sans honoraires", () => {
    expect(computeOurCommission(0)).toBe(0);
  });
});
