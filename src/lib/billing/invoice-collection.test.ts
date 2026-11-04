import { describe, expect, it } from "vitest";
import { createFakeDb } from "@/test-utils/fake-supabase";
import { buildInvoicesCsv } from "@/lib/accounting/invoices-csv";
import { allocateInvoiceCents, computeInvoiceTotals } from "./invoice-amounts";
import { loadCollectibleAmount, recordInvoiceCheckoutPayment } from "./invoice-collection";
import { createTypedInvoiceFromQuote, sumInvoicedOnQuote } from "./create-btp-invoice";

const invoice = { id: "i", invoice_type: "standard", status: "overdue", finalized_at: "2026-11-01", grand_total: 100000 };
const lines = [{ invoice_id: "i", line_total: 50000, vat_rate: 10, vat_category_code: "AA" },
  { invoice_id: "i", line_total: 50000, vat_rate: 20, vat_category_code: "S" }];

describe("Montants et règlements", () => {
  it("fait concorder document, encaissement d'une facture échue et export en TVA mixte", async () => {
    const { db } = createFakeDb({ invoice_lines: lines });
    const document = computeInvoiceTotals(lines.map((line) => ({
      lineTotalCents: line.line_total, vatRate: line.vat_rate, vatCategoryCode: line.vat_category_code,
    })));
    expect(document.totalTtcCents).toBe(115000);
    expect(await loadCollectibleAmount(db, invoice)).toBe(document.totalTtcCents);
    expect(buildInvoicesCsv([{
      ...invoice, invoice_number: "FAC-1", customer_name: "Client", customer_email: null,
      labor_total: 50000, materials_total: 50000, due_date: null, invoice_lines: lines,
    }]).split("\n")[1].split(",")[7]).toBe("115000");
  });

  it("enregistre le paiement TTC tardif une seule fois", async () => {
    const { db, tables } = createFakeDb({ invoices: [{ ...invoice }], invoice_lines: lines });
    const now = "2026-11-02T12:00:00Z";
    expect(await recordInvoiceCheckoutPayment(db, "i", 100000, now)).toBe(false);
    expect(await recordInvoiceCheckoutPayment(db, "i", 115000, now)).toBe(true);
    expect(await recordInvoiceCheckoutPayment(db, "i", 115000, "2026-11-03T12:00:00Z")).toBe(false);
    expect(tables.invoices[0]).toMatchObject({ status: "paid", payment_received_at: now });
  });

  it("ventile l’acompte par taux et ignore les achats directs", async () => {
    const { db, calls } = createFakeDb({ quote_materials: [
      { quote_id: "q", line_total: 50000, vat_rate: 20, exclude_from_invoice: false },
      { quote_id: "q", line_total: 70000, vat_rate: 5.5, exclude_from_invoice: true },
    ] }, { rpc: { save_invoice_draft: () => ({ data: "deposit", error: null }) } });
    const result = await createTypedInvoiceFromQuote(db, "a", {
      id: "q", artisan_id: "a", status: "accepted", customer_user_id: null, customer_name: "Test",
      customer_email: null, grand_total: 100000, notes: null, reduced_vat_rate: 10,
    }, { invoiceType: "deposit", amountCents: 30001, label: "Acompte" });
    expect(result).toEqual({ ok: true, invoiceId: "deposit" });
    expect(calls.find((c) => c.table === "rpc:save_invoice_draft")?.payload).toMatchObject({
      p_lines: [{ line_total: 15001, vat_rate: 10 }, { line_total: 15000, vat_rate: 20 }],
    });
  });

  it("écarte les avoirs et suspend la créance après émission d'un avoir", async () => {
    const { db, tables } = createFakeDb({ invoice_lines: lines, invoices: [] });
    expect(await loadCollectibleAmount(db, { ...invoice, invoice_type: "credit_note" })).toBeNull();
    tables.invoices.push({ credit_note_for_invoice_id: "i", invoice_type: "credit_note", finalized_at: "2026-11-02" });
    expect(await loadCollectibleAmount(db, invoice)).toBeNull();
  });

  it("bloque l'encaissement d'une facture incohérente", async () => {
    const { db } = createFakeDb({ invoice_lines: lines });
    expect(await loadCollectibleAmount(db, { ...invoice, grand_total: 90000 })).toBeNull();
  });

  it("alloue la retenue et l'arrondi sur tous les postes sans perte de centimes", () => {
    expect(allocateInvoiceCents(95000, [120000, 80000])).toEqual([57000, 38000]);
    expect(allocateInvoiceCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it("réserve les factures brouillons sans déduire un avoir avant son émission", async () => {
    const { db, tables } = createFakeDb({ invoices: [
      { quote_id: "q", grand_total: 100000, invoice_type: "standard" },
      { quote_id: "q", grand_total: 100000, invoice_type: "credit_note" },
    ] });
    expect(await sumInvoicedOnQuote(db, "q")).toBe(100000);
    tables.invoices[1].finalized_at = "2026-11-01";
    expect(await sumInvoicedOnQuote(db, "q")).toBe(0);
  });

  it("ne transforme pas une erreur de lecture en solde libre", async () => {
    const db = { from: () => ({ select: () => ({ eq: async () => ({ error: { code: "08006" } }) }) }) };
    await expect(sumInvoicedOnQuote(db as never, "q")).rejects.toThrow("invoice_total_read_failed");
  });
});
