"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function updateInvoiceDetail(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const invoiceNumber = String(formData.get("invoice_number") ?? "").trim();
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

  const { error } = await supabase
    .from("invoices")
    .update({
      invoice_number: invoiceNumber || null,
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

const FINALIZE_ERROR_MESSAGES: Record<string, string> = {
  not_found: "Facture introuvable.",
  already_finalized: "Cette facture est déjà finalisée.",
  not_draft: "Seul un brouillon peut être finalisé.",
  no_lines: "Ajoute des lignes via le devis avant de finaliser.",
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
