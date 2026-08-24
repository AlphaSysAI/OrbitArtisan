import "server-only";

import { sendEmail } from "@/lib/email/send-email";
import { getPublicSiteUrl } from "@/lib/site-url";

function formatEur(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export type SendQuoteEmailParams = {
  to: string;
  customerName?: string | null;
  businessName?: string | null;
  quotePublicToken: string;
  grandTotalCents: number;
};

export async function sendQuoteByEmail(params: SendQuoteEmailParams) {
  const siteUrl = getPublicSiteUrl();
  const quoteUrl = `${siteUrl}/devis/${params.quotePublicToken}`;
  const total = formatEur(params.grandTotalCents);
  const artisan = params.businessName?.trim() || "Votre artisan";
  const greeting = params.customerName?.trim() ? `Bonjour ${params.customerName.trim()},` : "Bonjour,";

  const subject = `${artisan} — votre devis (${total})`;

  const html = `
    <p>${greeting}</p>
    <p>Suite à notre échange, ${artisan} vous adresse un devis d'un montant de <strong>${total}</strong>.</p>
    <p><a href="${quoteUrl}">Consulter et accepter le devis en ligne</a></p>
    <p>Ce lien reste valable pour consultation et signature.</p>
    <p style="color:#666;font-size:12px;">Envoyé via Soline — secrétariat IA pour artisans du bâtiment.</p>
  `.trim();

  const text = [
    greeting,
    "",
    `Suite à notre échange, ${artisan} vous adresse un devis de ${total}.`,
    `Consultez-le ici : ${quoteUrl}`,
  ].join("\n");

  return sendEmail({ to: params.to, subject, html, text });
}
