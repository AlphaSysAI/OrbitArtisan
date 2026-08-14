import { NextResponse, type NextRequest } from "next/server";

import { loadFacturXDocumentFromDb } from "@/lib/billing/facturx";
import { renderInvoicePdf } from "@/lib/billing/facturx/render-invoice-pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
}

/** PDF visuel simple (flux B2C / e-reporting). */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await context.params;
  if (!invoiceId) {
    return NextResponse.json({ error: "missing_invoice_id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, artisan_id, invoice_number")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice || invoice.artisan_id !== profile.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const document = await loadFacturXDocumentFromDb(supabase, invoiceId);
  if (!document || document.lines.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const pdf = await renderInvoicePdf(document);
    const baseName = sanitizeFilename(document.invoiceNumber || invoice.id);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="facture-${baseName}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[invoice-pdf] generation failed", error);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
