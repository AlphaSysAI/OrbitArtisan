import { NextResponse } from "next/server";

import { loadQuotePdfDocument } from "@/lib/billing/load-quote-pdf";
import { renderQuotePdf } from "@/lib/billing/render-quote-pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, artisan_id, customer_user_id")
    .eq("id", quoteId)
    .maybeSingle();

  if (!quote) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  const isArtisan = profile?.id === quote.artisan_id;
  const isCustomer = quote.customer_user_id === user.id;

  if (!isArtisan && !isCustomer) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const doc = await loadQuotePdfDocument(supabase, quoteId, quote.artisan_id);
  if (!doc) {
    return NextResponse.json(
      {
        error: "pdf_failed",
        message:
          "Impossible de générer le PDF. Vérifie ton profil artisan (Réglages > Mon activité) et que le devis contient bien des lignes.",
      },
      { status: 422 },
    );
  }

  const pdfBytes = await renderQuotePdf(doc);

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="devis-${doc.quoteNumber.replace(/[^\w-]+/g, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
