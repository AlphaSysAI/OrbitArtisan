// Tests de caractérisation d'audit : confirment le comportement actuel,
// pas son acceptabilité. Base exclusivement en mémoire, aucun appel réseau.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/test-utils/fake-supabase";
import { sumInvoicedOnQuote, createTypedInvoiceFromQuote } from "@/lib/billing/create-btp-invoice";
import { classifyCustomer } from "@/lib/billing/invoicing/classify-customer";
import { runEReportingSubmission } from "@/lib/billing/invoicing/run-e-reporting";

afterEach(() => vi.unstubAllEnvs());
describe("Caractérisations Soline — audit uniquement", () => {
  it("un avoir brouillon libère immédiatement du montant à refacturer", async () => {
    const { db } = createFakeDb({ invoices: [
      { quote_id: "q", grand_total: 100000, invoice_type: "standard", status: "sent" },
      { quote_id: "q", grand_total: 100000, invoice_type: "credit_note", status: "draft" },
    ] });
    expect(await sumInvoicedOnQuote(db, "q")).toBe(0);
  });
  it("une erreur de lecture du cumul est interprétée comme zéro", async () => {
    const db = { from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { code: "08006", message: "connection failure" } }) }) }) };
    expect(await sumInvoicedOnQuote(db as never, "q")).toBe(0);
  });
  it("un professionnel avec SIREN mais sans numéro de TVA est classé B2C", () => {
    expect(classifyCustomer({ siren: "732829320", vatNumber: null })).toBe("b2c");
  });
  it("une erreur d'insertion des lignes laisse un brouillon consommant le solde", async () => {
    const { db, tables } = createFakeDb({ invoices: [] }, { insertError: { invoice_lines: { code: "23514", message: "constraint" } } });
    const result = await createTypedInvoiceFromQuote(db, "a", {
      id: "q", artisan_id: "a", status: "accepted", customer_user_id: null,
      customer_name: "Client fictif", customer_email: null, grand_total: 100000, notes: null,
    }, { invoiceType: "deposit", amountCents: 30000, label: "Acompte" });
    expect(result).toEqual({ ok: false, error: "lines_failed" });
    expect(tables.invoices).toHaveLength(1);
    expect(await sumInvoicedOnQuote(db, "q")).toBe(30000);
  });
  it("le mode e-reporting noop marque une ligne comme submitted sans transmission", async () => {
    vi.stubEnv("E_REPORTING_PROVIDER", "noop");
    const { db, tables } = createFakeDb({ e_reporting_queue: [{
      id: "e", artisan_id: "a", invoice_id: "i", reporting_period: "2026-11-01", status: "pending",
      payload: { invoiceId: "i", invoiceNumber: "INV-test", issueDate: "2026-11-01", currency: "EUR",
        seller: { name: "Fictif" }, buyer: { name: "Fictif" }, totals: { lineTotalCents: 100, taxTotalCents: 20, grandTotalCents: 120 }, vatBreakdown: [] },
    }] });
    const result = await runEReportingSubmission(db);
    expect(result.skippedNoop).toBe(true);
    expect(result.submittedTransactions).toBe(1);
    expect(tables.e_reporting_queue[0].status).toBe("submitted");
  });
  it("démonstrateur arithmétique : retenue et prorata produisent 980 € de lignes pour 950 € d'en-tête", () => {
    // Formules relevées dans invoices/actions.ts:70-86 et 169-179, pas un test de la server action.
    const quote = { grand_total: 200000, labor_total: 120000, material_line: 80000 };
    const remaining = 100000;
    const billable = remaining - Math.round(remaining * 0.05);
    const labor = Math.round(quote.labor_total * remaining / quote.grand_total);
    const material = Math.round(quote.material_line * billable / quote.grand_total);
    expect(billable).toBe(95000);
    expect(labor + material).toBe(98000);
  });
});
