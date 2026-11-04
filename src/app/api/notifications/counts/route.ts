import { NextResponse } from "next/server";

import { loadNotificationCounts } from "@/lib/notifications/counts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Perf (refacto latence, point 4) : les badges étaient rafraîchis par une
 * server action. Next exécute les server actions une par une : chaque
 * rafraîchissement (toutes les 90 s + retour sur l'onglet + navigation)
 * passait dans la même file que les envois de formulaires de l'artisan.
 * Un GET classique est indépendant de cette file.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const result = await loadNotificationCounts(supabase);
  const unavailable = !result.ok && result.error !== "auth";
  if (unavailable) console.error("[notifications/counts]", result.error);
  return NextResponse.json(unavailable ? { ok: false, error: "temporarily_unavailable" } : result, {
    status: result.ok ? 200 : unavailable ? 503 : 401,
    headers: { "Cache-Control": "private, no-store" },
  });
}
