import { describe, expect, it, vi } from "vitest";

import { classifyCustomer, isB2BCustomer } from "./classify-customer";
import { InvoiceService } from "./invoice-service";
import type { IPayloadSubmitter, PaSubmissionPayload, PaSubmissionResult } from "./payload-submitter";

describe("classifyCustomer", () => {
  it("B2B si SIREN et TVA valides", () => {
    expect(classifyCustomer({ siren: "123456789", vatNumber: "FR12123456789" })).toBe("b2b");
  });

  it("B2B via SIRET + TVA", () => {
    expect(isB2BCustomer({ siret: "12345678901234", vatNumber: "FR12123456789" })).toBe(true);
  });

  it("B2C sans identifiants légaux complets", () => {
    expect(classifyCustomer({})).toBe("b2c");
    expect(classifyCustomer({ siren: "123456789" })).toBe("b2c");
    expect(classifyCustomer({ vatNumber: "FR12123456789" })).toBe("b2c");
  });
});

class StubSubmitter implements IPayloadSubmitter {
  submitEInvoice = vi.fn(async (payload: PaSubmissionPayload): Promise<PaSubmissionResult> => ({
    submissionId: `test-${payload.invoiceId}`,
    status: "queued",
  }));
}

const artisanProfile = {
  business_name: "Artisan Test",
  phone: null,
  address_line1: "1 rue Test",
  postal_code: "69001",
  city: "Lyon",
  country_code: "FR",
  siren: "111111111",
  siret: "11111111111111",
  vat_number: "FR11111111111",
  naf_code: null,
  trade_register_number: null,
};

const invoiceLines = [
  {
    label: "Prestation",
    quantity: 1,
    line_total: 10000,
    sort_order: 0,
    vat_rate: 20,
    vat_category_code: "S",
    vat_exemption_reason: null,
  },
];

type MockConfig = {
  invoiceId: string;
  artisanId: string;
  invoiceNumber: string;
  customerUserId: string | null;
  customerProfile: Record<string, unknown> | null;
};

function createMockSupabase(config: MockConfig) {
  const updates: Record<string, unknown>[] = [];
  const queueInserts: Record<string, unknown>[] = [];

  const invoiceRow = {
    id: config.invoiceId,
    artisan_id: config.artisanId,
    invoice_number: config.invoiceNumber,
    customer_name: (config.customerProfile?.display_name as string) ?? "Jean Dupont",
    customer_email: (config.customerProfile?.email as string) ?? "jean@example.com",
    customer_user_id: config.customerUserId,
    notes: null,
    created_at: "2026-08-11T10:00:00.000Z",
    operation_type: "prestation_services",
    vat_on_debits: false,
    vat_collection_nature: "on_delivery",
    status: "draft",
    finalized_at: null,
  };

  const supabase = {
    from: (table: string) => {
      switch (table) {
        case "invoices":
          return {
            select: () => ({
              eq: (_col: string, _val: string) => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: invoiceRow, error: null }),
                }),
                maybeSingle: async () => ({ data: invoiceRow, error: null }),
              }),
            }),
            update: (payload: Record<string, unknown>) => {
              updates.push(payload);
              return {
                eq: () => ({
                  eq: () => ({
                    is: async () => ({ error: null }),
                  }),
                }),
              };
            },
          };
        case "profiles":
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: artisanProfile, error: null }),
              }),
            }),
          };
        case "invoice_lines":
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({ data: invoiceLines, error: null }),
              }),
            }),
          };
        case "customer_profiles":
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: config.customerProfile, error: null }),
              }),
            }),
          };
        case "e_reporting_queue":
          return {
            insert: (payload: Record<string, unknown>) => {
              queueInserts.push(payload);
              return {
                select: () => ({
                  single: async () => ({ data: { id: "queue-1" }, error: null }),
                }),
              };
            },
          };
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    },
  };

  return { supabase: supabase as never, updates, queueInserts };
}

describe("InvoiceService.finalize", () => {
  it(
    "route B2B vers e-invoicing + soumission PA",
    async () => {
      const submitter = new StubSubmitter();
      const { supabase, updates } = createMockSupabase({
        invoiceId: "inv-b2b",
        artisanId: "art-1",
        invoiceNumber: "FAC-B2B",
        customerUserId: "user-b2b",
        customerProfile: {
          display_name: "Entreprise SA",
          email: "compta@entreprise.fr",
          phone: null,
          address_line1: "10 rue Commerce",
          postal_code: "75001",
          city: "Paris",
          country_code: "FR",
          siren: "987654321",
          siret: "98765432109876",
          vat_number: "FR32987654321",
          naf_code: null,
          trade_register_number: null,
        },
      });

      const service = new InvoiceService(supabase, submitter);
      const result = await service.finalize("inv-b2b", "art-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.flow).toBe("e_invoicing");
      expect(result.paSubmissionId).toBe("test-inv-b2b");
      expect(result.facturXXml).toContain("CrossIndustryInvoice");
      expect(submitter.submitEInvoice).toHaveBeenCalledOnce();
      expect(updates[0]).toMatchObject({
        emission_flow: "e_invoicing",
        e_invoicing_status: "DEPOSITED",
        status: "sent",
      });
    },
    30_000,
  );

  it(
    "route B2C vers e-reporting + file d'attente",
    async () => {
      const submitter = new StubSubmitter();
      const { supabase, updates, queueInserts } = createMockSupabase({
        invoiceId: "inv-b2c",
        artisanId: "art-1",
        invoiceNumber: "FAC-B2C",
        customerUserId: null,
        customerProfile: null,
      });

      const service = new InvoiceService(supabase, submitter);
      const result = await service.finalize("inv-b2c", "art-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.flow).toBe("e_reporting");
      expect(result.eReportingQueueId).toBe("queue-1");
      expect(result.facturXXml).toBeUndefined();
      expect(submitter.submitEInvoice).not.toHaveBeenCalled();
      expect(queueInserts).toHaveLength(1);
      expect(queueInserts[0]).toMatchObject({ status: "pending", invoice_id: "inv-b2c" });
      expect(updates[0]).toMatchObject({ emission_flow: "e_reporting", status: "sent" });
    },
    15_000,
  );
});
