import { NextResponse } from "next/server";

import { runEReportingSubmission } from "@/lib/billing/invoicing/run-e-reporting";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/** Cron Vercel : transmission groupée e-reporting B2C. Sécurisé par CRON_SECRET. */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const result = await runEReportingSubmission(supabase);
  return NextResponse.json({ ok: true, ...result });
}
