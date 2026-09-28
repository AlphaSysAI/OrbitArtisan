import { NextResponse } from "next/server";

import { runAccountingExports } from "@/lib/accounting/monthly-export";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron quotidien de l'envoi comptable (sécurisé par CRON_SECRET) :
 * préavis 48 h avant le dernier jour du mois, envoi le dernier jour, rattrapage le lendemain.
 */
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

  const result = await runAccountingExports(supabase);
  return NextResponse.json({ ok: true, ...result });
}
