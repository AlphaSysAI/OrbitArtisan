import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { normalizePaWebhookEvent, PaWebhookPayloadSchema } from "@/lib/billing/invoicing/pa-webhook-events";
import { verifyPaWebhookSignature } from "@/lib/billing/invoicing/pa-webhook-signature";
import { processPaWebhookEvent } from "@/lib/billing/invoicing/process-pa-webhook";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function revalidateInvoicePaths(invoiceId: string) {
  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${invoiceId}`);
  revalidatePath("/compte/factures");
  revalidatePath(`/compte/factures/${invoiceId}`);
}

export async function POST(request: Request) {
  const secret = process.env.PA_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[PA webhook] PA_WEBHOOK_SECRET manquant");
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-pa-signature");

  if (!verifyPaWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const body =
    json && typeof json === "object" && "event" in json
      ? {
          ...(json as Record<string, unknown>),
          event: normalizePaWebhookEvent(String((json as { event: unknown }).event)) ?? (json as { event: string }).event,
        }
      : json;

  const parsed = PaWebhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    console.error("[PA webhook] client admin indisponible", error);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  const result = await processPaWebhookEvent(admin, parsed.data);

  if (!result.ok) {
    const status = result.code === "invoice_not_found" ? 404 : result.code === "invalid_payload" ? 400 : 500;
    return NextResponse.json({ error: result.code, message: result.message }, { status });
  }

  revalidateInvoicePaths(result.invoiceId);

  return NextResponse.json({
    ok: true,
    invoiceId: result.invoiceId,
    fiscalStatus: result.fiscalStatus,
  });
}
