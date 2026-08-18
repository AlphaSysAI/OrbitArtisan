import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumnError } from "@/lib/admin/db";

const CORE_INVOICE_SELECT =
  "id, artisan_id, quote_id, invoice_number, status, notes, labor_total, materials_total, grand_total, customer_user_id, customer_name, customer_email, created_at, finalized_at, emission_flow, e_invoicing_status, e_invoicing_rejection_reason, pa_submission_id";

const BTP_INVOICE_SELECT =
  "invoice_type, due_date, reminder_count, last_reminder_at, retention_amount, retention_rate, retention_released_at";

type CoreInvoiceRow = {
  id: string;
  artisan_id: string;
  quote_id: string;
  invoice_number: string | null;
  status: string;
  notes: string | null;
  labor_total: number;
  materials_total: number;
  grand_total: number;
  customer_user_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  created_at: string;
  finalized_at: string | null;
  emission_flow: string | null;
  e_invoicing_status: string | null;
  e_invoicing_rejection_reason: string | null;
  pa_submission_id: string | null;
};

type BtpInvoiceRow = {
  invoice_type: string;
  due_date: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  retention_amount: number;
  retention_rate: number;
  retention_released_at: string | null;
};

export type InvoiceForEditPage = CoreInvoiceRow & BtpInvoiceRow;

const BTP_DEFAULTS: BtpInvoiceRow = {
  invoice_type: "standard",
  due_date: null,
  reminder_count: 0,
  last_reminder_at: null,
  retention_amount: 0,
  retention_rate: 0,
  retention_released_at: null,
};

/** Charge une facture pour la page édition, tolérant aux migrations 05/06 non appliquées. */
export async function loadInvoiceForEditPage(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<InvoiceForEditPage | null> {
  const { data: core, error: coreError } = await supabase
    .from("invoices")
    .select(CORE_INVOICE_SELECT)
    .eq("id", invoiceId)
    .maybeSingle();

  if (coreError || !core) return null;

  const { data: btp, error: btpError } = await supabase
    .from("invoices")
    .select(BTP_INVOICE_SELECT)
    .eq("id", invoiceId)
    .maybeSingle();

  if (!btpError && btp) {
    return { ...(core as CoreInvoiceRow), ...(btp as BtpInvoiceRow) };
  }

  if (isMissingColumnError(btpError)) {
    return { ...(core as CoreInvoiceRow), ...BTP_DEFAULTS };
  }

  return { ...(core as CoreInvoiceRow), ...BTP_DEFAULTS };
}
