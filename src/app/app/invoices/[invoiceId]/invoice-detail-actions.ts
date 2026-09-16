"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vatFieldsForRate } from "@/lib/billing/einvoicing-types";

export async function updateInvoiceDetail(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const status = String(formData.get("status") ?? "draft").trim();

  if (!invoiceId) redirect("/app/invoices");
  if (!["draft", "sent", "paid", "overdue"].includes(status)) redirect(`/app/invoices/${invoiceId}?error=status`);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) redirect("/login");

  const { data: inv } = await supabase.from("invoices").select("id, artisan_id").eq("id", invoiceId).maybeSingle();
  if (!inv || inv.artisan_id !== profile.id) redirect("/app/invoices");

  // Point 4 audit pré-pilote : invoice_number n'est plus jamais écrit depuis
  // ce formulaire — il est attribué automatiquement à la finalisation
  // (compteur séquentiel) et ne doit plus jamais être un champ libre.
  const { error } = await supabase
    .from("invoices")
    .update({
      notes: notes || null,
      status,
    })
    .eq("id", invoiceId);

  if (error) redirect(`/app/invoices/${invoiceId}?error=update`);

  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${invoiceId}`);
  revalidatePath("/compte");
  revalidatePath("/compte/factures");
  revalidatePath(`/compte/factures/${invoiceId}`);
}

const VALID_MANUAL_VAT_RATES = [20, 10, 5.5];

/**
 * Point 3 audit pré-pilote : correction manuelle du taux de TVA — applique
 * un taux unique à TOUTES les lignes d'une facture brouillon (pas de
 * correction ligne par ligne pour rester simple côté artisan). Bloqué côté
 * serveur dès que la facture est finalisée (document légal immuable).
 */
export async function correctInvoiceVatRate(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const rate = Number(formData.get("vat_rate"));

  if (!invoiceId) redirect("/app/invoices");
  if (!VALID_MANUAL_VAT_RATES.includes(rate)) {
    redirect(`/app/invoices/${invoiceId}?error=vat_rate`);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) redirect("/login");

  const { data: inv } = await supabase
    .from("invoices")
    .select("id, artisan_id, status, finalized_at")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!inv || inv.artisan_id !== profile.id) redirect("/app/invoices");
  if (inv.status !== "draft" || inv.finalized_at) {
    redirect(`/app/invoices/${invoiceId}?error=vat_rate_locked`);
  }

  const { error } = await supabase
    .from("invoice_lines")
    .update({ ...vatFieldsForRate(rate) })
    .eq("invoice_id", invoiceId);

  if (error) redirect(`/app/invoices/${invoiceId}?error=vat_rate_update`);

  revalidatePath(`/app/invoices/${invoiceId}`);
  revalidatePath("/compte");
  revalidatePath(`/compte/factures/${invoiceId}`);
}

const FINALIZE_ERROR_MESSAGES: Record<string, string> = {
  not_found: "Facture introuvable.",
  already_finalized: "Cette facture est déjà finalisée.",
  not_draft: "Seul un brouillon peut être finalisé.",
  no_lines: "Ajoute des lignes via le devis avant de finaliser.",
  invalid_vat_rate: "Taux de TVA invalide sur une ligne — vérifie/corrige la TVA avant de finaliser.",
  missing_legal_info: "Informations obligatoires manquantes sur ton profil (SIRET / adresse / assurance décennale) — complète-les avant de finaliser.",
  finalize_in_progress: "Une finalisation est déjà en cours pour cette facture — réessaie dans un instant.",
  number_allocation_failed: "Impossible d'attribuer un numéro de facture — réessaie.",
  generation_failed: "Échec de génération du document.",
  pa_submission_failed: "Échec d'envoi à la Plateforme Agréée.",
  persist_failed: "Impossible d'enregistrer la finalisation.",
};

export async function finalizeInvoiceDetailForm(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  if (!invoiceId) redirect("/app/invoices?error=missing");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/invoices");

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) redirect("/login");

  const { createInvoiceService } = await import("@/lib/billing/invoicing");
  const service = createInvoiceService(supabase);
  const result = await service.finalize(invoiceId, profile.id);

  if (!result.ok) {
    const code = result.code in FINALIZE_ERROR_MESSAGES ? result.code : "persist_failed";
    redirect(`/app/invoices/${invoiceId}?finalize_error=${encodeURIComponent(code)}`);
  }

  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${invoiceId}`);
  revalidatePath("/compte");
  revalidatePath("/compte/factures");
  revalidatePath(`/compte/factures/${invoiceId}`);

  redirect(
    `/app/invoices/${invoiceId}?finalized=1&flow=${encodeURIComponent(result.flow)}&download=1`,
  );
}
