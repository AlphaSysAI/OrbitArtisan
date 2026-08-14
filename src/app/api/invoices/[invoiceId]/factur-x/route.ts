import { NextResponse, type NextRequest } from "next/server";

import {
  FacturXValidationError,
  generateFacturX,
  loadFacturXDocumentFromDb,
} from "@/lib/billing/facturx";
import type { FacturXProfile } from "@/lib/billing/facturx/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
}

function parseProfile(value: string | null): FacturXProfile {
  if (value === "basic") return "basic";
  return "en16931";
}

export async function GET(
  request: NextRequest,
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

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, artisan_id, invoice_number")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice || invoice.artisan_id !== profile.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const document = await loadFacturXDocumentFromDb(supabase, invoiceId);
  if (!document) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (document.lines.length === 0) {
    return NextResponse.json({ error: "no_lines" }, { status: 400 });
  }

  const profileParam = parseProfile(request.nextUrl.searchParams.get("profile"));

  try {
    const { pdf } = await generateFacturX(document, { profile: profileParam });

    const baseName = sanitizeFilename(document.invoiceNumber || invoice.id);
    const filename = `facture-${baseName}-factur-x.pdf`;

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof FacturXValidationError) {
      return NextResponse.json(
        { error: "facturx_validation_failed", message: error.message },
        { status: 422 },
      );
    }

    console.error("[factur-x] generation failed", error);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
