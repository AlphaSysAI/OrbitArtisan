import { afterEach, describe, expect, it, vi } from "vitest";

import { classifyCustomer, isB2BCustomer } from "./classify-customer";
import * as invoicingFreeze from "../invoicing-freeze";
import { InvoiceService } from "./invoice-service";
import type { IPayloadSubmitter, PaSubmissionPayload, PaSubmissionResult } from "./payload-submitter";

afterEach(() => {
  vi.restoreAllMocks();
});

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

const artisanProfile: {
  business_name: string;
  phone: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  country_code: string | null;
  siren: string | null;
  siret: string | null;
  vat_number: string | null;
  naf_code: string | null;
  trade_register_number: string | null;
  decennale_insurer: string | null;
  decennale_policy_number: string | null;
  rc_pro_insurer: string | null;
  rc_pro_number: string | null;
  mediator_name: string | null;
  mediator_url: string | null;
} = {
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
  decennale_insurer: "MAAF Pro",
  decennale_policy_number: "DEC-123456",
  rc_pro_insurer: null,
  rc_pro_number: null,
  mediator_name: null,
  mediator_url: null,
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
  invoiceLines?: typeof invoiceLines;
  artisanProfile?: typeof artisanProfile;
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
    rpc: async (fnName: string, _args: Record<string, unknown>) => {
      if (fnName === "allocate_invoice_number") {
        return { data: config.invoiceNumber || "INV-2026-0001", error: null };
      }
      throw new Error(`Unexpected rpc: ${fnName}`);
    },
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
              // Chaîne flexible couvrant à la fois le claim anti double-submit
              // (.eq().eq().eq().is().or().select().maybeSingle()) et les
              // updates finales / de libération de claim, plus courtes et
              // directement awaited après .is() (voir invoice-service.ts).
              const claimResult = { data: { id: config.invoiceId }, error: null };
              const afterIs: {
                or: () => { select: () => { maybeSingle: () => Promise<typeof claimResult> } };
                then: (resolve: (v: { error: null }) => void, reject?: (e: unknown) => void) => Promise<void>;
              } = {
                or: () => ({
                  select: () => ({
                    maybeSingle: async () => claimResult,
                  }),
                }),
                then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject),
              };
              const chain = {
                eq: () => chain,
                is: () => afterIs,
              };
              return chain;
            },
          };
        case "profiles":
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: config.artisanProfile ?? artisanProfile, error: null }),
              }),
            }),
          };
        case "invoice_lines":
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({ data: config.invoiceLines ?? invoiceLines, error: null }),
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
      // Test des mécanismes de routage/soumission PA, indépendant de l'état
      // réel du gel B2B (couvert par invoicing-freeze.test.ts et par le test
      // dédié ci-dessous).
      vi.spyOn(invoicingFreeze, "isDraftInvoicingFrozenForCustomer").mockReturnValue(false);
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
      // updates[0] = claim anti double-submit (finalizing_at), updates[1] = update finale.
      expect(updates).toHaveLength(2);
      expect(updates[0]).toMatchObject({ finalizing_at: expect.any(String) });
      expect(updates[1]).toMatchObject({
        emission_flow: "e_invoicing",
        e_invoicing_status: "DEPOSITED",
        status: "sent",
        finalizing_at: null,
      });
    },
    30_000,
  );

  it(
    "bloque le finalize() d'un client B2B tant que B2B_INVOICING_FROZEN est vrai (garde-fou Vague 7)",
    async () => {
      // Aucun mock de invoicingFreeze ici : on vérifie le comportement réel
      // de production (B2B toujours gelé). Ce garde-fou protège contre tout
      // futur point d'entrée qui créerait un brouillon B2B sans repasser par
      // les contrôles de src/app/app/invoices/actions.ts.
      const submitter = new StubSubmitter();
      const { supabase, updates } = createMockSupabase({
        invoiceId: "inv-b2b-frozen",
        artisanId: "art-1",
        invoiceNumber: "FAC-B2B-FROZEN",
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
      const rpcSpy = vi.spyOn(supabase, "rpc");

      const service = new InvoiceService(supabase, submitter);
      const result = await service.finalize("inv-b2b-frozen", "art-1");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("invoicing_frozen");

      // Ni numéro alloué, ni soumission PA — l'échec doit survenir avant
      // tout effet de bord coûteux ou irréversible.
      expect(rpcSpy).not.toHaveBeenCalled();
      expect(submitter.submitEInvoice).not.toHaveBeenCalled();
      // updates[0] = claim anti double-submit, updates[1] = libération du claim.
      expect(updates).toHaveLength(2);
      expect(updates[1]).toMatchObject({ finalizing_at: null });
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
      expect(updates).toHaveLength(2);
      expect(updates[1]).toMatchObject({ emission_flow: "e_reporting", status: "sent", finalizing_at: null });
    },
    15_000,
  );

  it("bloque la finalisation si une ligne a un taux de TVA invalide", async () => {
    const submitter = new StubSubmitter();
    const { supabase, updates } = createMockSupabase({
      invoiceId: "inv-bad-vat",
      artisanId: "art-1",
      invoiceNumber: "FAC-BAD-VAT",
      customerUserId: null,
      customerProfile: null,
      invoiceLines: [
        {
          label: "Prestation",
          quantity: 1,
          line_total: 10000,
          sort_order: 0,
          vat_rate: 8.5,
          vat_category_code: "S",
          vat_exemption_reason: null,
        },
      ],
    });

    const service = new InvoiceService(supabase, submitter);
    const result = await service.finalize("inv-bad-vat", "art-1");

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.code).toBe("invalid_vat_rate");
    expect(submitter.submitEInvoice).not.toHaveBeenCalled();
    // updates[0] = claim posé avant le contrôle TVA, updates[1] = libération
    // du claim suite au blocage (pour permettre un nouvel essai immédiat).
    expect(updates).toHaveLength(2);
    expect(updates[1]).toMatchObject({ finalizing_at: null });
  });

  it("bloque la finalisation si l'assurance décennale de l'artisan est manquante", async () => {
    const submitter = new StubSubmitter();
    const { supabase, updates } = createMockSupabase({
      invoiceId: "inv-no-insurance",
      artisanId: "art-1",
      invoiceNumber: "FAC-NO-INSURANCE",
      customerUserId: null,
      customerProfile: null,
      artisanProfile: {
        ...artisanProfile,
        decennale_insurer: null,
        decennale_policy_number: null,
      },
    });

    const service = new InvoiceService(supabase, submitter);
    const result = await service.finalize("inv-no-insurance", "art-1");

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.code).toBe("missing_legal_info");
    expect(result.message).toContain("assurance décennale");
    expect(submitter.submitEInvoice).not.toHaveBeenCalled();
    expect(updates).toHaveLength(2);
    expect(updates[1]).toMatchObject({ finalizing_at: null });
  });

  it("bloque un finalize() concurrent tant qu'un claim est actif (anti double-submit)", async () => {
    const submitter = new StubSubmitter();
    const { supabase } = createMockSupabase({
      invoiceId: "inv-concurrent",
      artisanId: "art-1",
      invoiceNumber: "FAC-CONCURRENT",
      customerUserId: null,
      customerProfile: null,
    });

    // Simule un claim déjà posé par un premier appel en cours : le mock
    // .update().eq()...is() renvoie normalement { data: { id }, error: null }
    // pour le claim ; on force ici une réponse "aucune ligne affectée" pour
    // reproduire le cas où le WHERE (finalizing_at is null OR expiré) ne
    // matche plus rien.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawSupabase = supabase as any;
    const originalFrom = rawSupabase.from;
    let callCount = 0;
    rawSupabase.from = (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = originalFrom(table) as any;
      if (table === "invoices") {
        const originalUpdate = result.update;
        result.update = (payload: Record<string, unknown>) => {
          callCount += 1;
          if (callCount === 1) {
            const chain = {
              eq: () => chain,
              is: () => ({
                or: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            };
            return chain;
          }
          return originalUpdate(payload);
        };
      }
      return result;
    };

    const service = new InvoiceService(supabase, submitter);
    const result = await service.finalize("inv-concurrent", "art-1");

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.code).toBe("finalize_in_progress");
    expect(submitter.submitEInvoice).not.toHaveBeenCalled();
  });
});
