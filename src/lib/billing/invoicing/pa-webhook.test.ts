import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { mapPaEventToFiscalStatus } from "./pa-webhook-events";
import { verifyPaWebhookSignature } from "./pa-webhook-signature";
import { processPaWebhookEvent } from "./process-pa-webhook";

describe("mapPaEventToFiscalStatus", () => {
  it("mappe les événements PA vers les statuts fiscaux", () => {
    expect(mapPaEventToFiscalStatus("RECEIVED_BY_PLATFORM")).toBe("RECEIVED_BY_PLATFORM");
    expect(mapPaEventToFiscalStatus("TRANSMITTED")).toBe("TRANSMITTED");
    expect(mapPaEventToFiscalStatus("ACCEPTED")).toBe("APPROVED");
    expect(mapPaEventToFiscalStatus("REFUSED")).toBe("REJECTED");
    expect(mapPaEventToFiscalStatus("PAYMENT_RECEIVED")).toBe("PAID");
  });
});

describe("verifyPaWebhookSignature", () => {
  it("valide une signature HMAC sha256", () => {
    const secret = "test-secret";
    const body = '{"event":"TRANSMITTED","invoiceId":"00000000-0000-4000-8000-000000000001"}';
    const hex = createHmac("sha256", secret).update(body).digest("hex");

    expect(verifyPaWebhookSignature(body, `sha256=${hex}`, secret)).toBe(true);
    expect(verifyPaWebhookSignature(body, "sha256=deadbeef", secret)).toBe(false);
  });
});

describe("processPaWebhookEvent", () => {
  it("met à jour le statut fiscal et le motif de rejet", async () => {
    const updates: Record<string, unknown>[] = [];
    const admin = {
      from: (table: string) => {
        if (table === "invoices") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "inv-1", status: "sent", grand_total: 12000, emission_flow: "e_invoicing" },
                  error: null,
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => {
              updates.push(payload);
              return {
                eq: () => Promise.resolve({ error: null }),
              };
            },
          };
        }
        if (table === "pa_webhook_events") {
          return { insert: async () => ({ error: null }) };
        }
        throw new Error(table);
      },
    };

    const result = await processPaWebhookEvent(admin as never, {
      event: "REFUSED",
      invoiceId: "00000000-0000-4000-8000-000000000001",
      rejectionReason: "TVA incorrecte",
      rejectionCode: "BR-CO-15",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fiscalStatus).toBe("REJECTED");
    expect(updates[0]).toMatchObject({
      e_invoicing_status: "REJECTED",
      e_invoicing_rejection_reason: "TVA incorrecte — BR-CO-15",
    });
  });

  it("passe la facture en payée sur PAYMENT_RECEIVED", async () => {
    const updates: Record<string, unknown>[] = [];
    const admin = {
      from: (table: string) => {
        if (table === "invoices") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "inv-2", status: "sent", grand_total: 5000, emission_flow: "e_invoicing" },
                  error: null,
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => {
              updates.push(payload);
              return {
                eq: () => Promise.resolve({ error: null }),
              };
            },
          };
        }
        if (table === "pa_webhook_events") {
          return { insert: async () => ({ error: null }) };
        }
        throw new Error(table);
      },
    };

    const result = await processPaWebhookEvent(admin as never, {
      event: "PAYMENT_RECEIVED",
      submissionId: "sub-123",
      paymentAmountCents: 5000,
    });

    expect(result.ok).toBe(true);
    expect(updates[0]).toMatchObject({
      e_invoicing_status: "PAID",
      status: "paid",
    });
  });
});
