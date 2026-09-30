import { NextResponse, type NextRequest } from "next/server";

import { loadQuotePdfDocument } from "@/lib/billing/load-quote-pdf";
import { renderQuotePdf } from "@/lib/billing/render-quote-pdf";
import { verifyQuoteResponseToken } from "@/lib/quotes/response-link";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/** PDF du devis pour le porteur du lien signé (client sans compte). Jamais un brouillon. */
export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const id = verifyQuoteResponseToken(token);
  const db = createSupabaseServiceRoleClient();
  if (!id || !db) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: quote } = await db.from("quotes").select("id, artisan_id, status").eq("id", id).maybeSingle();
  if (!quote || quote.status === "draft") return NextResponse.json({ error: "not_found" }, { status: 404 });

  const doc = await loadQuotePdfDocument(db, id, quote.artisan_id as string, { issuerClient: db });
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const pdf = await renderQuotePdf(doc);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="devis-${doc.quoteNumber.replace(/[^\w-]+/g, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
