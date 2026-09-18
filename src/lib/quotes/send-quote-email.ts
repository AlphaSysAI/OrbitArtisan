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

// Vague 8 : expéditeur dédié aux emails de devis, demandé par Florian —
// scope volontairement limité à cet envoi (les relances de facture dans
// invoice-reminders.ts gardent le "from" par défaut de sendEmail(),
// noreply@solinebtp.fr ou EMAIL_FROM si défini). Suppose que le domaine
// solinebtp.fr est vérifié côté Resend (SPF/DKIM) avant mise en prod,
// sinon Resend rejettera l'envoi ou le fera atterrir en spam.
const QUOTE_EMAIL_FROM = "Soline <support@solinebtp.fr>";

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

  // Vague 8 : sujet fixe demandé par Florian ("un devis pour vous"), au lieu
  // du sujet précédent qui incluait artisan/numéro/montant. Compromis assumé :
  // moins d'info immédiate pour le client (numéro de devis absent du sujet,
  // donc moins facile à retrouver dans sa boîte mail plus tard), mais reste
  // dans le corps du message et dans le PDF joint.
  const subject = "Un devis pour vous";

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
    from: QUOTE_EMAIL_FROM,
    subject,
    html,
    text,
    attachments: pdfBase64
      ? [{ filename: `devis-${fileStem}.pdf`, content: pdfBase64 }]
      : undefined,
  });
}
