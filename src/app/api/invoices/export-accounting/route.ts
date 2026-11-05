import { NextResponse } from "next/server";

import { buildInvoicesCsv, type InvoiceCsvRow } from "@/lib/accounting/invoices-csv";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Export comptable CSV des factures finalisées. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("id, business_name").contains("account_user_ids", [user.id]).maybeSingle();
  if (!profile?.id) return NextResponse.json({ error: "profile" }, { status: 403 });

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      "invoice_number, status, invoice_type, grand_total, labor_total, materials_total, customer_name, customer_email, finalized_at, due_date, payment_received_at, created_at, invoice_lines(line_total, vat_rate, vat_category_code)",
    )
    .eq("artisan_id", profile.id)
    .not("finalized_at", "is", null)
    .order("finalized_at", { ascending: true });

  if (error) return NextResponse.json({ error: "invoice_export_failed" }, { status: 500 });

  const csv = buildInvoicesCsv((invoices ?? []) as InvoiceCsvRow[]);
  const filename = `export-comptable-${profile.business_name.replace(/[^\w-]+/g, "-").slice(0, 30)}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
