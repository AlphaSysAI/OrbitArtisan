import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { runReengagement } from "@/lib/telemetry/reengagement";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Relances opérationnelles des comptes à risque (sécurisé par CRON_SECRET). */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createSupabaseServiceRoleClient();
  if (!db) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  return NextResponse.json({ ok: true, ...(await runReengagement(db)) });
}
