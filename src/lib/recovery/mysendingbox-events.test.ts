import { describe, expect, it } from "vitest";

import {
  isKnownLetterEvent,
  mapLetterEventToStatus,
  MySendingBoxWebhookSchema,
  shouldApplyStatus,
} from "./mysendingbox-events";

describe("mapLetterEventToStatus", () => {
  it("mappe les étapes clés de l'acheminement LRAR", () => {
    expect(mapLetterEventToStatus("letter.filing_proof")).toBe("sent");
    expect(mapLetterEventToStatus("letter.in_transit")).toBe("in_transit");
    expect(mapLetterEventToStatus("letter.waiting_to_be_withdrawn")).toBe("waiting_withdrawal");
    expect(mapLetterEventToStatus("letter.distributed")).toBe("delivered");
    expect(mapLetterEventToStatus("letter.delivery_proof")).toBe("delivered");
    expect(mapLetterEventToStatus("letter.returned_to_sender")).toBe("returned");
    expect(mapLetterEventToStatus("letter.wrong_address")).toBe("wrong_address");
    expect(mapLetterEventToStatus("letter.lost")).toBe("failed");
  });

  it("ignore letter.created, déjà pris en compte à l'envoi", () => {
    expect(mapLetterEventToStatus("letter.created")).toBeNull();
  });

  it("rejette les événements du canal électronique", () => {
    expect(isKnownLetterEvent("letter.electronic.sent")).toBe(false);
  });
});

describe("shouldApplyStatus", () => {
  it("laisse progresser l'acheminement", () => {
    expect(shouldApplyStatus("sent", "in_transit")).toBe(true);
    expect(shouldApplyStatus("in_transit", "delivered")).toBe(true);
  });

  it("empêche un webhook tardif de faire régresser le statut", () => {
    expect(shouldApplyStatus("delivered", "in_transit")).toBe(false);
    expect(shouldApplyStatus("delivered", "sent")).toBe(false);
  });
});

describe("MySendingBoxWebhookSchema", () => {
  it("accepte un callback réel avec preuve de distribution", () => {
    const parsed = MySendingBoxWebhookSchema.safeParse({
      created_at: "2026-07-02T15:27:12.998Z",
      event: { _id: "rJY86qJUW", name: "letter.delivery_proof", category: "letter", letter: "SkyVo5yIZ" },
      letter: {
        _id: "SkyVo5yIZ",
        tracking_number: "1E00121046208",
        delivery_proof: { _id: "f1", url: "https://example.com/ar.pdf", type: "delivery_proof" },
      },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.letter?.tracking_number).toBe("1E00121046208");
  });

  it("refuse un callback sans nom d'événement", () => {
    expect(MySendingBoxWebhookSchema.safeParse({ event: { name: "" } }).success).toBe(false);
  });
});
