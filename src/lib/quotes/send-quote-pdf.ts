import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadQuotePdfDocument } from "@/lib/billing/load-quote-pdf";
import { renderQuotePdf } from "@/lib/billing/render-quote-pdf";
import { sendMessageWithPdfAttachment } from "@/lib/messages/send-pdf-message";
import { validateQuoteBeforeSend } from "@/lib/quotes/validate-quote-before-send";
import { buildQuoteNotificationMessage } from "@/lib/quotes/supplier-links";
import type { DirectPurchaseItem } from "@/lib/quotes/supplier-links";
import { formatCents } from "@/lib/format/money";

type SendQuotePdfResult =
  | { ok: true }
  | { ok: false; error: "pdf_failed" }
  | { ok: false; error: "quote_pdf_profile_incomplete"; validation: import("@/lib/billing/quote-pdf-legal").QuoteLegalValidation };

export async function sendQuotePdfInConversation(
  supabase: SupabaseClient,
  params: {
    conversationId: string;
    senderUserId: string;
    quoteId: string;
    artisanId: string;
    grandTotalCents: number;
    directPurchaseItems: DirectPurchaseItem[];
  },
): Promise<SendQuotePdfResult> {
  const check = await validateQuoteBeforeSend(supabase, params.quoteId, params.artisanId);
  if (!check.ok) {
    return { ok: false as const, error: "quote_pdf_profile_incomplete" as const, validation: check.validation };
  }

  const doc = await loadQuotePdfDocument(supabase, params.quoteId, params.artisanId);
  if (!doc) return { ok: false as const, error: "pdf_failed" as const };

  const pdfBytes = await renderQuotePdf(doc);

  // Montant TTC du PDF joint (et non grand_total, qui est HT).
  const totalFmt = `${formatCents(doc.totalTtcCents)} TTC`;

  const body = buildQuoteNotificationMessage({
    totalFormatted: totalFmt,
    directPurchaseItems: params.directPurchaseItems,
  });

  const sent = await sendMessageWithPdfAttachment(supabase, {
    conversationId: params.conversationId,
    senderUserId: params.senderUserId,
    body,
    pdfBytes,
    fileName: `devis-${doc.quoteNumber.replace(/[^\w-]+/g, "-")}.pdf`,
  });
  if (!sent.ok) return { ok: false as const, error: "pdf_failed" as const };
  return { ok: true as const };
}
