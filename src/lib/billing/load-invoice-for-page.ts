import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumnError } from "@/lib/admin/db";

/** Colonnes de base (schéma initial invoices). */
const MINIMAL_INVOICE_SELECT =
  "id, artisan_id, quote_id, invoice_number, status, notes, labor_total, materials_total, grand_total, customer_user_id, customer_name, customer_email, created_at";

const EINVOICING_INVOICE_SELECT =
  "finalized_at, emission_flow, e_invoicing_status, e_invoicing_rejection_reason, pa_submission_id";

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
};

type EinvoicingInvoiceRow = {
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

export type InvoiceForEditPage = CoreInvoiceRow & EinvoicingInvoiceRow & BtpInvoiceRow;

export type InvoiceListRow = CoreInvoiceRow &
  Partial<EinvoicingInvoiceRow> &
  Partial<Pick<BtpInvoiceRow, "invoice_type">>;

const EINVOICING_DEFAULTS: EinvoicingInvoiceRow = {
  finalized_at: null,
  emission_flow: null,
  e_invoicing_status: null,
  e_invoicing_rejection_reason: null,
  pa_submission_id: null,
};

const BTP_DEFAULTS: BtpInvoiceRow = {
  invoice_type: "standard",
  due_date: null,
  reminder_count: 0,
  last_reminder_at: null,
  retention_amount: 0,
  retention_rate: 0,
  retention_released_at: null,
};

async function trySelectInvoiceExtras<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  invoiceId: string,
  select: string,
): Promise<Partial<T> | null> {
  const { data, error } = await supabase.from("invoices").select(select).eq("id", invoiceId).maybeSingle();
  if (error) {
    if (isMissingColumnError(error)) return null;
    console.error("[load-invoice] extra select failed", error.message);
    return null;
  }
  return (data as T | null) ?? null;
}

/** Charge une facture pour la page édition, tolérant aux migrations e-invoicing / BTP non appliquées. */
export async function loadInvoiceForEditPage(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<InvoiceForEditPage | null> {
  const { data: core, error: coreError } = await supabase
    .from("invoices")
    .select(MINIMAL_INVOICE_SELECT)
    .eq("id", invoiceId)
    .maybeSingle();

  if (coreError) {
    console.error("[load-invoice] core select failed", coreError.message);
    return null;
  }
  if (!core) return null;

  const einvoicingExtra =
    await trySelectInvoiceExtras<EinvoicingInvoiceRow>(supabase, invoiceId, EINVOICING_INVOICE_SELECT);

  const btpExtra = await trySelectInvoiceExtras<BtpInvoiceRow>(supabase, invoiceId, BTP_INVOICE_SELECT);

  return {
    ...(core as CoreInvoiceRow),
    ...EINVOICING_DEFAULTS,
    ...einvoicingExtra,
    ...BTP_DEFAULTS,
    ...btpExtra,
  };
}

/** Factures liées à un devis (page détail devis). */
export async function loadInvoicesForQuote(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<
  {
    id: string;
    invoice_number: string | null;
    grand_total: number;
    status: string;
    created_at: string;
    invoice_type: string;
    progress_percentage: number | null;
  }[]
> {
  const minimalSelect = "id, invoice_number, grand_total, status, created_at";
  const { data: minimal, error: minimalError } = await supabase
    .from("invoices")
    .select(minimalSelect)
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true });

  if (minimalError) {
    console.error("[load-invoices-for-quote] failed", minimalError.message);
    return [];
  }

  const rows = (minimal ?? []) as {
    id: string;
    invoice_number: string | null;
    grand_total: number;
    status: string;
    created_at: string;
  }[];

  const { data: extended, error: extendedError } = await supabase
    .from("invoices")
    .select("id, invoice_type, progress_percentage")
    .eq("quote_id", quoteId);

  const extendedById = new Map<string, { invoice_type?: string; progress_percentage?: number | null }>();
  if (!extendedError && extended) {
    for (const row of extended as { id: string; invoice_type?: string; progress_percentage?: number | null }[]) {
      extendedById.set(row.id, row);
    }
  }

  return rows.map((row) => {
    const extra = extendedById.get(row.id);
    return {
      ...row,
      invoice_type: extra?.invoice_type ?? "standard",
      progress_percentage: extra?.progress_percentage ?? null,
    };
  });
}

export async function loadArtisanInvoicesForList(
  supabase: SupabaseClient,
  artisanId: string,
): Promise<InvoiceListRow[]> {
  const { data: rows, error } = await supabase
    .from("invoices")
    .select(MINIMAL_INVOICE_SELECT)
    .eq("artisan_id", artisanId);

  if (error) {
    console.error("[load-invoices-list] failed", error.message);
    return [];
  }

  const base = (rows ?? []) as CoreInvoiceRow[];
  if (!base.length) return [];

  const ids = base.map((r) => r.id);
  const einvoicingById = new Map<string, Partial<EinvoicingInvoiceRow>>();
  const btpById = new Map<string, Partial<BtpInvoiceRow>>();

  const { data: einvoicingRows, error: einvoicingError } = await supabase
    .from("invoices")
    .select(`id, ${EINVOICING_INVOICE_SELECT}`)
    .in("id", ids);

  if (!einvoicingError && einvoicingRows) {
    for (const row of einvoicingRows as (Partial<EinvoicingInvoiceRow> & { id: string })[]) {
      einvoicingById.set(row.id, row);
    }
  } else if (einvoicingError && !isMissingColumnError(einvoicingError)) {
    console.error("[load-invoices-list] einvoicing select failed", einvoicingError.message);
  }

  const { data: btpRows, error: btpError } = await supabase
    .from("invoices")
    .select(`id, invoice_type`)
    .in("id", ids);

  if (!btpError && btpRows) {
    for (const row of btpRows as { id: string; invoice_type?: string }[]) {
      btpById.set(row.id, { invoice_type: row.invoice_type ?? "standard" });
    }
  }

  return base.map((row) => ({
    ...row,
    ...(einvoicingById.get(row.id) ?? EINVOICING_DEFAULTS),
    ...(btpById.get(row.id) ?? { invoice_type: "standard" }),
  }));
}
