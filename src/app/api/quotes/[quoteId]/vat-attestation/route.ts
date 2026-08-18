import { NextResponse } from "next/server";

import { renderVatAttestationPdf } from "@/lib/billing/render-vat-attestation-pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("id, business_name, name, siret").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return NextResponse.json({ error: "profile" }, { status: 403 });

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, artisan_id, customer_name, customer_email, grand_total, created_at, reduced_vat_rate, generate_vat_attestation, work_site_address, work_site_city, work_site_postal_code",
    )
    .eq("id", quoteId)
    .eq("artisan_id", profile.id)
    .maybeSingle();

  if (!quote) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!quote.generate_vat_attestation) {
    return NextResponse.json({ error: "attestation_disabled" }, { status: 400 });
  }

  const vatRate = quote.reduced_vat_rate === 5.5 || quote.reduced_vat_rate === 10 ? quote.reduced_vat_rate : null;
  if (!vatRate) return NextResponse.json({ error: "invalid_vat_rate" }, { status: 400 });

  if (!quote.work_site_address?.trim()) {
    return NextResponse.json({ error: "missing_work_site" }, { status: 400 });
  }

  const pdfBytes = await renderVatAttestationPdf({
    artisanBusinessName: profile.business_name ?? "Entreprise",
    artisanName: profile.name,
    artisanSiret: profile.siret,
    customerName: quote.customer_name ?? quote.customer_email ?? "Client",
    customerAddress: null,
    workSiteAddress: quote.work_site_address,
    workSitePostalCode: quote.work_site_postal_code,
    workSiteCity: quote.work_site_city,
    vatRate,
    quoteId: quote.id,
    quoteTotalHtEur: (quote.grand_total ?? 0) / 100,
    quoteDate: new Date(quote.created_at),
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="attestation-tva-${quoteId.slice(0, 8)}.pdf"`,
    },
  });
}
