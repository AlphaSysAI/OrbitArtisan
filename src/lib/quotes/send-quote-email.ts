import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { emailButton, escapeHtml } from "@/lib/email/html";
import { quoteResponseUrl } from "@/lib/quotes/response-link";
import { sendEmail } from "@/lib/email/send-email";
import { loadQuotePdfDocument } from "@/lib/billing/load-quote-pdf";
import { renderQuotePdf } from "@/lib/billing/render-quote-pdf";
import { validateQuoteBeforeSend } from "@/lib/quotes/validate-quote-before-send";
import { formatCents } from "@/lib/format/money";

// Vague 8 : expéditeur dédié aux emails de devis, demandé par Florian —
// scope volontairement limité à cet envoi (les relances de facture dans
// invoice-reminders.ts gardent le "from" par défaut de sendEmail(),
// noreply@solinebtp.fr ou EMAIL_FROM si défini). Suppose que le domaine
// solinebtp.fr est vérifié côté Resend (SPF/DKIM) avant mise en prod,
// sinon Resend rejettera l'envoi ou le fera atterrir en spam.
const QUOTE_EMAIL_FROM = "Soline <support@solinebtp.fr>";

type SendQuoteEmailParams = {
  supabase: SupabaseClient;
  quoteId: string;
  artisanId: string;
  to: string;
  customerName?: string | null;
  businessName?: string | null;
  grandTotalCents: number;
};

export async function sendQuoteByEmail(params: SendQuoteEmailParams) {
  // Lien signé : répondre sans compte (accepter, refuser, être rappelé, écrire à l'artisan).
  const clientQuoteUrl = quoteResponseUrl(params.quoteId);

  const artisan = params.businessName?.trim() || "Votre artisan";
  const greeting = params.customerName?.trim() ? `Bonjour ${params.customerName.trim()},` : "Bonjour,";

  const check = await validateQuoteBeforeSend(params.supabase, params.quoteId, params.artisanId);
  if (!check.ok) return { ok: false as const, error: "quote_pdf_profile_incomplete" as const };

  const doc = await loadQuotePdfDocument(params.supabase, params.quoteId, params.artisanId);
  const pdfBytes = doc ? await renderQuotePdf(doc) : null;
  const pdfBase64 = pdfBytes ? Buffer.from(pdfBytes).toString("base64") : null;
  const fileStem = doc?.quoteNumber.replace(/[^\w-]+/g, "-") ?? params.quoteId.slice(0, 8);
  const quoteRef = doc?.quoteNumber ?? params.quoteId.slice(0, 8).toUpperCase();
  // Montant = celui du PDF joint (TTC, TVA par ligne). grand_total est HT :
  // l'annoncer « TTC » était faux et ne correspondait pas au PDF.
  const total = doc ? formatCents(doc.totalTtcCents) : `${formatCents(params.grandTotalCents)} HT`;
  // Franchise 293 B : montant net (aucune TVA) — ne pas écrire « TTC ».
  const totalSuffix = doc ? (doc.vatFranchise ? " (TVA non applicable, art. 293 B du CGI)" : " TTC") : "";

  // Vague 8 : sujet fixe demandé par Florian ("un devis pour vous"), au lieu
  // du sujet précédent qui incluait artisan/numéro/montant. Compromis assumé :
  // moins d'info immédiate pour le client (numéro de devis absent du sujet,
  // donc moins facile à retrouver dans sa boîte mail plus tard), mais reste
  // dans le corps du message et dans le PDF joint.
  const subject = "Un devis pour vous";

  const legalNotice =
    "Le document PDF joint reprend l'ensemble des mentions légales obligatoires (identité de l'entreprise, SIRET, assurances, TVA, validité du devis, conditions de paiement et, le cas échéant, droit de rétractation).";

  const html = `
    <p>${escapeHtml(greeting)}</p>
    <p><strong>${escapeHtml(artisan)}</strong> vous adresse son devis n° <strong>${escapeHtml(quoteRef)}</strong>, d'un montant de <strong>${total}</strong>${totalSuffix}.</p>
    <p>Retrouvez le détail des prestations, fournitures et montants dans le PDF en pièce jointe${pdfBase64 ? "" : " (indisponible — contactez directement votre artisan)"}.</p>
    <p style="font-size:13px;color:#444;">${legalNotice}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
    <p><strong>Après avoir consulté le devis</strong>, vous pouvez y répondre en ligne en un clic : l'accepter, le refuser, ou contacter ${escapeHtml(artisan)} pour en discuter. Aucun compte n'est nécessaire.</p>
    ${emailButton(clientQuoteUrl, "Répondre au devis")}
    <p style="color:#666;font-size:12px;margin-top:24px;">Message envoyé par ${escapeHtml(artisan)} via Soline.</p>
  `.trim();

  const text = [
    greeting,
    "",
    `${artisan} vous adresse son devis n° ${quoteRef}, d'un montant de ${total}${totalSuffix}.`,
    pdfBase64 ? "Le PDF détaillé est en pièce jointe." : "",
    legalNotice,
    "",
    `Répondre au devis (accepter, refuser, contacter l'artisan) : ${clientQuoteUrl}`,
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
