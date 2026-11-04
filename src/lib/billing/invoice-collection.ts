import type { SupabaseClient } from "@supabase/supabase-js";
import { computeInvoiceTotals } from "./invoice-amounts";

export type InvoiceCollectionRow = {
  id: string;
  invoice_type: string | null;
  status: string;
  finalized_at: string | null;
  grand_total: number | null;
};

export function canCollectInvoice(invoice: InvoiceCollectionRow) {
  return !!invoice.finalized_at && invoice.invoice_type !== "credit_note" &&
    (invoice.status === "sent" || invoice.status === "overdue");
}

/** Suspension du recouvrement en présence d'un avoir émis. La compensation
 * et les remboursements nécessitent une règle métier distincte. */
export async function loadCollectibleAmount(db: SupabaseClient, invoice: InvoiceCollectionRow) {
  if (!canCollectInvoice(invoice)) return null;
  const [lines, credits] = await Promise.all([
    db.from("invoice_lines").select("line_total, vat_rate, vat_category_code").eq("invoice_id", invoice.id),
    db.from("invoices").select("id").eq("credit_note_for_invoice_id", invoice.id)
      .eq("invoice_type", "credit_note").not("finalized_at", "is", null).limit(1),
  ]);
  if (lines.error || credits.error) throw new Error("invoice_collection_read_failed");
  if (!lines.data?.length || credits.data?.length) return null;
  const totals = computeInvoiceTotals(lines.data.map((line) => ({
    lineTotalCents: line.line_total, vatRate: line.vat_rate, vatCategoryCode: line.vat_category_code,
  })));
  return totals.totalHtCents === invoice.grand_total && totals.totalTtcCents > 0 ? totals.totalTtcCents : null;
}

/** Compare le montant signé par Stripe puis clôture une seule fois la créance. */
export async function recordInvoiceCheckoutPayment(
  db: SupabaseClient, invoiceId: string, amountCents: number, receivedAt: string,
) {
  const { data: invoice, error } = await db.from("invoices")
    .select("id, grand_total, status, invoice_type, finalized_at").eq("id", invoiceId).maybeSingle();
  if (error) throw error;
  if (!invoice) {
    console.error("[invoice payment] paiement Stripe reçu pour une facture introuvable — rapprochement manuel", { invoiceId, amountCents });
    return false;
  }
  if (invoice.status === "paid") return false;
  const expected = await loadCollectibleAmount(db, invoice);
  if (expected !== amountCents) {
    // L'argent est encaissé chez Stripe : il faut une trace pour le rapprocher.
    console.error("[invoice payment] paiement Stripe non rapproché — montant ou statut incohérent", {
      invoiceId, amountCents, expectedCents: expected, status: invoice.status, invoiceType: invoice.invoice_type,
    });
    return false;
  }
  const update = await db.from("invoices")
    .update({ status: "paid", payment_received_at: receivedAt })
    .eq("id", invoiceId).in("status", ["sent", "overdue"]).select("id").maybeSingle();
  if (update.error) throw update.error;
  if (!update.data) {
    console.error("[invoice payment] paiement Stripe non appliqué — statut modifié entre-temps", { invoiceId, amountCents });
  }
  return !!update.data;
}
