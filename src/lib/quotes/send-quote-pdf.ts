import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadQuotePdfDocument } from "@/lib/billing/load-quote-pdf";
import { renderQuotePdf } from "@/lib/billing/render-quote-pdf";
import { sendMessageWithPdfAttachment } from "@/lib/messages/send-pdf-message";
import { buildQuoteNotificationMessage } from "@/lib/quotes/supplier-links";
import type { DirectPurchaseItem } from "@/lib/quotes/supplier-links";

export async function renderQuotePdfBytes(
  supabase: SupabaseClient,
  quoteId: string,
  artisanId: string,
): Promise<Uint8Array | null> {
  const doc = await loadQuotePdfDocument(supabase, quoteId, artisanId);
  if (!doc) return null;
  return renderQuotePdf(doc);
}

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
) {
  const pdfBytes = await renderQuotePdfBytes(supabase, params.quoteId, params.artisanId);
  if (!pdfBytes) return { ok: false as const, error: "pdf_failed" as const };

  const totalFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    params.grandTotalCents / 100,
  );

  const body = buildQuoteNotificationMessage({
    totalFormatted: totalFmt,
    directPurchaseItems: params.directPurchaseItems,
  });

  return sendMessageWithPdfAttachment(supabase, {
    conversationId: params.conversationId,
    senderUserId: params.senderUserId,
    body,
    pdfBytes,
    fileName: `devis-${params.quoteId.slice(0, 8)}.pdf`,
  });
}
