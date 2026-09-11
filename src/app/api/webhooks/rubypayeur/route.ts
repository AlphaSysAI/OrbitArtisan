import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { processRubypayeurWebhook } from "@/lib/recovery/process-rubypayeur-webhook";
import {
  isKnownRubypayeurEvent,
  RubypayeurWebhookSchema,
} from "@/lib/recovery/rubypayeur-events";
import { verifyHmacSignature } from "@/lib/recovery/webhook-security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Cycle de vie des dossiers de recouvrement RubyPayeur.
 * Signature HMAC-SHA256 du corps brut vérifiée avec `RUBYPAYEUR_WEBHOOK_SECRET`.
 */
export async function POST(request: Request) {
  const secret = process.env.RUBYPAYEUR_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[rubypayeur webhook] RUBYPAYEUR_WEBHOOK_SECRET manquant");
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature =
    request.headers.get("x-rubypayeur-signature") ?? request.headers.get("x-signature");

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = RubypayeurWebhookSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (!isKnownRubypayeurEvent(parsed.data.event)) {
    return NextResponse.json({ ok: true, ignored: true, event: parsed.data.event });
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    console.error("[rubypayeur webhook] client admin indisponible", error);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  const result = await processRubypayeurWebhook(admin, parsed.data);

  if (!result.ok) {
    const status = result.code === "case_not_found" ? 404 : 500;
    return NextResponse.json({ error: result.code, message: result.message }, { status });
  }

  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${result.invoiceId}`);
  revalidatePath("/compte/factures");

  return NextResponse.json({
    ok: true,
    invoiceId: result.invoiceId,
    caseId: result.caseId,
    status: result.status,
  });
}
