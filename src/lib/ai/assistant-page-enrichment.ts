import type { SupabaseClient } from "@supabase/supabase-js";

import type { AssistantPageContextPayload } from "@/lib/ai/assistant-page-context";
import { invoiceStatusLabel, quoteStatusLabel } from "@/lib/status-labels";

function formatEur(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export async function buildAssistantPageContextBlock(
  supabase: SupabaseClient,
  artisanId: string,
  pageContext: AssistantPageContextPayload | null | undefined,
): Promise<string> {
  if (!pageContext?.pathname) return "Page actuelle : (inconnue)";

  const lines = [`Page actuelle : ${pageContext.label} (${pageContext.pathname})`];

  if (!pageContext.entityType || !pageContext.entityId) return lines.join("\n");

  if (pageContext.entityType === "quote") {
    const { data } = await supabase
      .from("quotes")
      .select("customer_name, status, grand_total, sent_at")
      .eq("id", pageContext.entityId)
      .eq("artisan_id", artisanId)
      .maybeSingle();
    if (data) {
      lines.push(
        `Devis ouvert : client ${data.customer_name ?? "—"}, statut ${quoteStatusLabel(data.status)}, total ${formatEur(data.grand_total ?? 0)}${data.sent_at ? ", déjà envoyé" : ""}.`,
      );
    }
  }

  if (pageContext.entityType === "invoice") {
    const { data } = await supabase
      .from("invoices")
      .select("customer_name, status, grand_total, due_date")
      .eq("id", pageContext.entityId)
      .eq("artisan_id", artisanId)
      .maybeSingle();
    if (data) {
      lines.push(
        `Facture ouverte : client ${data.customer_name ?? "—"}, statut ${invoiceStatusLabel(data.status)}, total ${formatEur(data.grand_total ?? 0)}${data.due_date ? `, échéance ${data.due_date}` : ""}.`,
      );
    }
  }

  if (pageContext.entityType === "contact") {
    const { data: cp } = await supabase
      .from("customer_profiles")
      .select("display_name, email")
      .eq("user_id", pageContext.entityId)
      .maybeSingle();
    if (cp) {
      lines.push(
        `Client ouvert : ${cp.display_name ?? cp.email ?? "client"}${cp.email ? ` (${cp.email})` : ""}.`,
      );
    }
  }

  if (pageContext.entityType === "conversation") {
    const { data } = await supabase
      .from("conversations")
      .select("customer_user_id, lead_id")
      .eq("id", pageContext.entityId)
      .eq("artisan_id", artisanId)
      .maybeSingle();
    if (data?.customer_user_id) {
      const { data: cp } = await supabase
        .from("customer_profiles")
        .select("display_name, email")
        .eq("user_id", data.customer_user_id)
        .maybeSingle();
      if (cp) {
        lines.push(
          `Conversation ouverte : ${cp.display_name ?? cp.email ?? "client"}.`,
        );
      }
    } else if (data?.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("contact_name")
        .eq("id", data.lead_id)
        .maybeSingle();
      lines.push(`Conversation ouverte : ${lead?.contact_name ?? "demande Soline"}.`);
    }
  }

  if (pageContext.entityType === "project") {
    const { data } = await supabase
      .from("projects")
      .select("name, status, client_name")
      .eq("id", pageContext.entityId)
      .eq("artisan_id", artisanId)
      .maybeSingle();
    if (data) {
      lines.push(
        `Chantier ouvert : ${data.name ?? "Sans titre"}${data.client_name ? ` · ${data.client_name}` : ""}${data.status ? ` · ${data.status}` : ""}.`,
      );
    }
  }

  return lines.join("\n");
}
