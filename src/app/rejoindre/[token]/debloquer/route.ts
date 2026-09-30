import { NextResponse, type NextRequest } from "next/server";

import { claimInvite, loadInvite } from "@/lib/concierge/invites";
import { dispatchLeadToArtisans } from "@/lib/leads/dispatch-lead";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/** Après inscription / connexion : attribue le chantier au nouvel artisan. */
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const origin = request.nextUrl.origin;
  const back = (err?: string) => NextResponse.redirect(new URL(`/rejoindre/${token}${err ? `?erreur=${err}` : ""}`, origin));

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/register?next=${encodeURIComponent(`/rejoindre/${token}/debloquer`)}`, origin));

  const db = createSupabaseServiceRoleClient();
  if (!db) return back();
  const invite = await loadInvite(db, token);
  if (!invite) return back();

  const { data: profile } = await db.from("profiles").select("id, latitude, longitude").eq("user_id", user.id).maybeSingle();
  if (!profile) return NextResponse.redirect(new URL(`/app/onboarding`, origin));

  const res = await claimInvite(
    db,
    invite,
    { id: profile.id as string, latitude: (profile.latitude as number | null) ?? null, longitude: (profile.longitude as number | null) ?? null },
    (leadToken) => dispatchLeadToArtisans(leadToken),
  );
  if (!res.ok) return back(res.error);
  return NextResponse.redirect(new URL(res.conversationId ? `/app/messages/${res.conversationId}` : "/app", origin));
}
