import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { MySendingBoxWebhookSchema } from "@/lib/recovery/mysendingbox-events";
import { processMySendingBoxWebhook } from "@/lib/recovery/process-mysendingbox-webhook";
import { verifySharedSecret } from "@/lib/recovery/webhook-security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Suivi d'acheminement des mises en demeure LRAR.
 *
 * MySendingBox ne signe pas ses callbacks : l'authentification repose sur un
 * secret partagé transmis dans l'en-tête `x-webhook-secret` ou en paramètre
 * d'URL, et la lettre doit exister en base pour être traitée.
 */
export async function POST(request: Request) {
  const secret = process.env.MYSENDINGBOX_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[mysendingbox webhook] MYSENDINGBOX_WEBHOOK_SECRET manquant");
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  if (!verifySharedSecret(request, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = MySendingBoxWebhookSchema.safeParse(json);
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
    console.error("[mysendingbox webhook] client admin indisponible", error);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  const result = await processMySendingBoxWebhook(admin, parsed.data);

  if (!result.ok) {
    // 200 sur les événements non gérés : MySendingBox rejoue 8 fois sur non-200.
    if (result.code === "unknown_event") {
      return NextResponse.json({ ok: true, ignored: true, reason: result.code });
    }
    const status = result.code === "letter_not_found" ? 404 : 500;
    return NextResponse.json({ error: result.code, message: result.message }, { status });
  }

  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${result.invoiceId}`);

  return NextResponse.json({
    ok: true,
    invoiceId: result.invoiceId,
    noticeId: result.noticeId,
    status: result.status,
  });
}
