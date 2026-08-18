import type { SupabaseClient } from "@supabase/supabase-js";

import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { buildLegalMentionLines } from "@/lib/billing/legal-mentions";

import type { FacturXInvoiceDocument, FacturXLineInput } from "./types";

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  notes: string | null;
  created_at: string;
  operation_type: string | null;
  vat_on_debits: boolean | null;
  vat_collection_nature: string | null;
};

type ProfileRow = {
  business_name: string;
  name: string | null;
  email?: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
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
};

type CustomerProfileRow = {
  display_name: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country_code: string | null;
  siren: string | null;
  siret: string | null;
  vat_number: string | null;
  naf_code: string | null;
  trade_register_number: string | null;
};

type InvoiceLineRow = {
  label: string;
  quantity: number | null;
  line_total: number;
  sort_order: number;
  vat_rate: number | null;
  vat_category_code: string | null;
  vat_exemption_reason: string | null;
};

/** Charge une facture Supabase et la mappe vers le document Factur-X. */
export async function loadFacturXDocumentFromDb(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<FacturXInvoiceDocument | null> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, customer_name, customer_email, customer_user_id, notes, created_at, operation_type, vat_on_debits, vat_collection_nature, artisan_id",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError || !invoice) return null;

  const inv = invoice as InvoiceRow & { customer_user_id: string | null; artisan_id: string };

  const [{ data: profile }, { data: lines }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "business_name, name, phone, address_line1, address_line2, postal_code, city, country_code, siren, siret, vat_number, naf_code, trade_register_number, decennale_insurer, decennale_policy_number, rc_pro_insurer, rc_pro_number, mediator_name, mediator_url",
      )
      .eq("id", inv.artisan_id)
      .maybeSingle(),
    supabase
      .from("invoice_lines")
      .select("label, quantity, line_total, sort_order, vat_rate, vat_category_code, vat_exemption_reason")
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true }),
  ]);

  if (!profile) return null;

  let customerProfile: CustomerProfileRow | null = null;
  if (inv.customer_user_id) {
    const { data } = await supabase
      .from("customer_profiles")
      .select(
        "display_name, email, phone, address_line1, address_line2, postal_code, city, country_code, siren, siret, vat_number, naf_code, trade_register_number",
      )
      .eq("user_id", inv.customer_user_id)
      .maybeSingle();
    customerProfile = data as CustomerProfileRow | null;
  }

  const seller = profile as ProfileRow;
  const mappedLines: FacturXLineInput[] = ((lines ?? []) as InvoiceLineRow[]).map((line, index) => ({
    lineNumber: index + 1,
    label: line.label,
    quantity: line.quantity ?? 1,
    lineTotalCents: line.line_total,
    vatRate: line.vat_rate ?? 20,
    vatCategoryCode: line.vat_category_code ?? "S",
    vatExemptionReason: line.vat_exemption_reason,
  }));

  return {
    invoiceNumber: inv.invoice_number ?? `DRAFT-${inv.id.slice(0, 8).toUpperCase()}`,
    issueDate: new Date(inv.created_at),
    seller: {
      name: seller.business_name,
      siren: seller.siren,
      siret: seller.siret,
      vatNumber: seller.vat_number,
      nafCode: seller.naf_code,
      addressLine1: seller.address_line1,
      addressLine2: seller.address_line2,
      postalCode: seller.postal_code,
      city: seller.city,
      countryCode: seller.country_code ?? "FR",
      tradeRegisterNumber: seller.trade_register_number,
      phone: seller.phone,
    },
    buyer: {
      name: formatContactDisplayName({
        profileName: customerProfile?.display_name,
        name: inv.customer_name,
        email: customerProfile?.email ?? inv.customer_email,
      }),
      siren: customerProfile?.siren ?? null,
      siret: customerProfile?.siret ?? null,
      vatNumber: customerProfile?.vat_number ?? null,
      nafCode: customerProfile?.naf_code ?? null,
      addressLine1: customerProfile?.address_line1 ?? null,
      addressLine2: customerProfile?.address_line2 ?? null,
      postalCode: customerProfile?.postal_code ?? null,
      city: customerProfile?.city ?? null,
      countryCode: customerProfile?.country_code ?? "FR",
      tradeRegisterNumber: customerProfile?.trade_register_number ?? null,
      email: customerProfile?.email ?? inv.customer_email,
      phone: customerProfile?.phone ?? null,
    },
    lines: mappedLines,
    notes: inv.notes,
    operationType: (inv.operation_type as FacturXInvoiceDocument["operationType"]) ?? undefined,
    vatOnDebits: inv.vat_on_debits ?? undefined,
    vatCollectionNature: (inv.vat_collection_nature as FacturXInvoiceDocument["vatCollectionNature"]) ?? undefined,
    legalMentions: buildLegalMentionLines({
      business_name: seller.business_name,
      siren: seller.siren,
      siret: seller.siret,
      vat_number: seller.vat_number,
      trade_register_number: seller.trade_register_number,
      decennale_insurer: seller.decennale_insurer,
      decennale_policy_number: seller.decennale_policy_number,
      rc_pro_insurer: seller.rc_pro_insurer,
      rc_pro_number: seller.rc_pro_number,
      mediator_name: seller.mediator_name,
      mediator_url: seller.mediator_url,
    }),
  };
}
