import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { formatContactDisplayName } from "@/lib/contacts/display-name";

import { normalizeRecoveryStatus, type RecoveryStatus } from "./types";

export type RecoveryInvoice = {
  id: string;
  artisanId: string;
  quoteId: string | null;
  invoiceNumber: string;
  status: string;
  recoveryStatus: RecoveryStatus;
  grandTotalCents: number;
  issueDate: Date;
  dueDate: Date | null;
  daysOverdue: number;
  rubypayeurCaseId: string | null;
};

export type RecoveryCreditor = {
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
  siren: string | null;
  siret: string | null;
  vatNumber: string | null;
  email: string | null;
  phone: string | null;
};

export type RecoveryDebtor = {
  name: string;
  isBusiness: boolean;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
  siren: string | null;
  vatNumber: string | null;
  email: string | null;
  phone: string | null;
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
  vat_number: string | null;
};

export type RecoveryContext = {
  invoice: RecoveryInvoice;
  creditor: RecoveryCreditor;
  debtor: RecoveryDebtor;
};

export type LoadRecoveryContextResult =
  | { ok: true; context: RecoveryContext }
  | { ok: false; error: "not_found" | "profile_incomplete" | "debtor_address_missing" | "load_failed" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Charge la facture, l'artisan créancier et le débiteur nécessaires aux envois
 * LRAR et à la transmission du dossier de recouvrement.
 *
 * L'appelant doit fournir `artisanId` : le filtre est appliqué en base, ce qui
 * garantit la propriété même si le client Supabase contourne la RLS.
 */
export async function loadRecoveryContext(
  supabase: SupabaseClient,
  invoiceId: string,
  artisanId: string,
): Promise<LoadRecoveryContextResult> {
  if (!UUID_RE.test(invoiceId)) return { ok: false, error: "not_found" };

  const { data: invoiceRow, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "id, artisan_id, quote_id, invoice_number, status, recovery_status, rubypayeur_case_id, grand_total, created_at, due_date, customer_name, customer_email, customer_user_id",
    )
    .eq("id", invoiceId)
    .eq("artisan_id", artisanId)
    .maybeSingle();

  if (invoiceError) {
    console.error("[recovery] chargement facture", { invoiceId, message: invoiceError.message });
    return { ok: false, error: "load_failed" };
  }
  if (!invoiceRow) return { ok: false, error: "not_found" };

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select(
      "business_name, name, phone, address_line1, address_line2, postal_code, city, country_code, siren, siret, vat_number",
    )
    .eq("id", artisanId)
    .maybeSingle();

  if (profileError) {
    console.error("[recovery] chargement profil", { artisanId, message: profileError.message });
    return { ok: false, error: "load_failed" };
  }
  if (!profileRow) return { ok: false, error: "profile_incomplete" };

  // Un LRAR exige une adresse expéditeur complète (obligatoire côté La Poste).
  const creditor: RecoveryCreditor = {
    name: nonEmpty(profileRow.business_name) ?? nonEmpty(profileRow.name) ?? "",
    addressLine1: nonEmpty(profileRow.address_line1),
    addressLine2: nonEmpty(profileRow.address_line2),
    postalCode: nonEmpty(profileRow.postal_code),
    city: nonEmpty(profileRow.city),
    countryCode: nonEmpty(profileRow.country_code) ?? "FR",
    siren: nonEmpty(profileRow.siren),
    siret: nonEmpty(profileRow.siret),
    vatNumber: nonEmpty(profileRow.vat_number),
    email: null,
    phone: nonEmpty(profileRow.phone),
  };

  if (!creditor.name || !creditor.addressLine1 || !creditor.postalCode || !creditor.city) {
    return { ok: false, error: "profile_incomplete" };
  }

  let customerProfile: CustomerProfileRow | null = null;
  if (invoiceRow.customer_user_id) {
    const { data } = await supabase
      .from("customer_profiles")
      .select(
        "display_name, email, phone, address_line1, address_line2, postal_code, city, country_code, siren, vat_number",
      )
      .eq("user_id", invoiceRow.customer_user_id)
      .maybeSingle();
    customerProfile = (data as CustomerProfileRow | null) ?? null;
  }

  const debtorSiren = nonEmpty(customerProfile?.siren);
  const debtor: RecoveryDebtor = {
    name: formatContactDisplayName({
      profileName: customerProfile?.display_name,
      name: invoiceRow.customer_name,
      email: nonEmpty(customerProfile?.email) ?? invoiceRow.customer_email,
    }),
    isBusiness: debtorSiren !== null,
    addressLine1: nonEmpty(customerProfile?.address_line1),
    addressLine2: nonEmpty(customerProfile?.address_line2),
    postalCode: nonEmpty(customerProfile?.postal_code),
    city: nonEmpty(customerProfile?.city),
    countryCode: nonEmpty(customerProfile?.country_code) ?? "FR",
    siren: debtorSiren,
    vatNumber: nonEmpty(customerProfile?.vat_number),
    email: nonEmpty(customerProfile?.email) ?? nonEmpty(invoiceRow.customer_email),
    phone: nonEmpty(customerProfile?.phone),
  };

  if (!debtor.addressLine1 || !debtor.postalCode || !debtor.city) {
    return { ok: false, error: "debtor_address_missing" };
  }

  const issueDate = new Date(invoiceRow.created_at);
  const dueDate = invoiceRow.due_date ? new Date(invoiceRow.due_date) : null;

  return {
    ok: true,
    context: {
      invoice: {
        id: invoiceRow.id,
        artisanId: invoiceRow.artisan_id,
        quoteId: invoiceRow.quote_id ?? null,
        invoiceNumber: invoiceRow.invoice_number ?? `FACT-${invoiceRow.id.slice(0, 8).toUpperCase()}`,
        status: invoiceRow.status,
        recoveryStatus: normalizeRecoveryStatus(invoiceRow.recovery_status),
        grandTotalCents: Number(invoiceRow.grand_total ?? 0),
        issueDate,
        dueDate,
        daysOverdue: dueDate ? daysBetween(dueDate, new Date()) : 0,
        rubypayeurCaseId: nonEmpty(invoiceRow.rubypayeur_case_id),
      },
      creditor,
      debtor,
    },
  };
}
