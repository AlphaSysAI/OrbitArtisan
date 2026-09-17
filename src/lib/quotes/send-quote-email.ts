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
  const quoteRef = doc?.quoteNumber ?? params.quoteId.slice(0, 8).toUpperCase();

  const subject = `${artisan} — votre devis n° ${quoteRef} (${total})`;

  const legalNotice =
    "Le document PDF joint reprend l'ensemble des mentions légales obligatoires (identité de l'entreprise, SIRET, assurances, TVA, validité du devis, conditions de paiement et, le cas échéant, droit de rétractation).";

  const html = `
    <p>${greeting}</p>
    <p><strong>${artisan}</strong> vous adresse son devis n° <strong>${quoteRef}</strong>, d'un montant de <strong>${total}</strong> TTC.</p>
    <p>Retrouvez le détail des prestations, fournitures et montants dans le PDF en pièce jointe${pdfBase64 ? "" : " (indisponible — contactez directement votre artisan)"}.</p>
    <p style="font-size:13px;color:#444;">${legalNotice}</p>
    <p>Vous pouvez consulter ce devis et y répondre (acceptation ou refus) depuis votre espace client : <a href="${clientQuoteUrl}">${clientQuoteUrl}</a>.</p>
    <p style="color:#666;font-size:12px;margin-top:24px;">Message envoyé par ${artisan} via Soline.</p>
  `.trim();

  const text = [
    greeting,
    "",
    `${artisan} vous adresse son devis n° ${quoteRef}, d'un montant de ${total} TTC.`,
    pdfBase64 ? "Le PDF détaillé est en pièce jointe." : "",
    legalNotice,
    "",
    `Espace client : ${clientQuoteUrl}`,
    "",
    `Message envoyé par ${artisan} via Soline.`,
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
