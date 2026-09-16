import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail } from "@/lib/email/send-email";
import { loadQuotePdfDocument } from "@/lib/billing/load-quote-pdf";
import { renderQuotePdf } from "@/lib/billing/render-quote-pdf";
import { validateQuoteBeforeSend } from "@/lib/quotes/validate-quote-before-send";
import { getPublicSiteUrl } from "@/lib/site-url";

function formatEur(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export type SendQuoteEmailParams = {
  supabase: SupabaseClient;
  quoteId: string;
  artisanId: string;
  to: string;
  customerName?: string | null;
  businessName?: string | null;
  grandTotalCents: number;
};

export async function sendQuoteByEmail(params: SendQuoteEmailParams) {
  const siteUrl = getPublicSiteUrl();
  const clientQuoteUrl = `${siteUrl}/mes-devis/${params.quoteId}`;
  const total = formatEur(params.grandTotalCents);
  const artisan = params.businessName?.trim() || "Votre artisan";
  const greeting = params.customerName?.trim() ? `Bonjour ${params.customerName.trim()},` : "Bonjour,";

  const check = await validateQuoteBeforeSend(params.supabase, params.quoteId, params.artisanId);
  if (!check.ok) return { ok: false as const, error: "quote_pdf_profile_incomplete" as const };

  const doc = await loadQuotePdfDocument(params.supabase, params.quoteId, params.artisanId);
  const pdfBytes = doc ? await renderQuotePdf(doc) : null;
  const pdfBase64 = pdfBytes ? Buffer.from(pdfBytes).toString("base64") : null;
  const fileStem = doc?.quoteNumber.replace(/[^\w-]+/g, "-") ?? params.quoteId.slice(0, 8);

  const subject = `${artisan} — votre devis (${total})`;

  const html = `
    <p>${greeting}</p>
    <p>Suite à notre échange, ${artisan} vous adresse un devis d'un montant de <strong>${total}</strong>.</p>
    <p>Le document PDF est en pièce jointe${pdfBase64 ? "" : " (indisponible — contactez votre artisan)"}.</p>
    <p>Vous pouvez aussi consulter et répondre au devis depuis votre espace client : <a href="${clientQuoteUrl}">Mes devis</a>.</p>
    <p style="color:#666;font-size:12px;">Envoyé via Soline — secrétariat IA pour artisans du bâtiment.</p>
  `.trim();

  const text = [
    greeting,
    "",
    `Suite à notre échange, ${artisan} vous adresse un devis de ${total}.`,
    pdfBase64 ? "Le PDF est en pièce jointe." : "",
    `Espace client : ${clientQuoteUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return sendEmail({
    to: params.to,
    subject,
    html,
    text,
    attachments: pdfBase64
      ? [{ filename: `devis-${fileStem}.pdf`, content: pdfBase64 }]
      : undefined,
  });
}
