import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function escapeCsv(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Export comptable CSV des factures finalisées. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("id, business_name").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return NextResponse.json({ error: "profile" }, { status: 403 });

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "invoice_number, status, invoice_type, grand_total, labor_total, materials_total, customer_name, customer_email, finalized_at, due_date, created_at",
    )
    .eq("artisan_id", profile.id)
    .not("finalized_at", "is", null)
    .order("finalized_at", { ascending: true });

  const header = [
    "Numero",
    "Type",
    "Statut",
    "Date emission",
    "Date echeance",
    "Client",
    "Email client",
    "Total TTC centimes",
    "MO centimes",
    "Materiaux centimes",
  ].join(",");

  const rows = (invoices ?? []).map((inv) =>
    [
      escapeCsv(inv.invoice_number),
      escapeCsv(inv.invoice_type),
      escapeCsv(inv.status),
      escapeCsv(inv.finalized_at?.slice(0, 10)),
      escapeCsv(inv.due_date),
      escapeCsv(inv.customer_name),
      escapeCsv(inv.customer_email),
      inv.grand_total ?? 0,
      inv.labor_total ?? 0,
      inv.materials_total ?? 0,
    ].join(","),
  );

  const csv = [header, ...rows].join("\n");
  const filename = `export-comptable-${profile.business_name.replace(/\s+/g, "-").slice(0, 30)}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
