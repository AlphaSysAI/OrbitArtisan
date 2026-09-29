import { NextResponse, type NextRequest } from "next/server";

import { verifyTrackingToken } from "@/lib/appointments/tracking-link";
import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/**
 * Rattache une demande faite sans compte au compte client connecté. Le lien de suivi signé
 * (reçu dans la boîte mail du client) fait office de preuve : jamais de rattachement sur
 * simple saisie d'e-mail. Crée aussi la conversation avec l'artisan.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const origin = request.nextUrl.origin;
  const tracking = `/rdv/suivi/${token}`;

  const id = verifyTrackingToken(token);
  if (!id) return NextResponse.redirect(new URL(tracking, origin));

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const next = encodeURIComponent(`${tracking}/rattacher`);
    return NextResponse.redirect(new URL(`/login?role=particulier&next=${next}`, origin));
  }

  const admin = createSupabaseServiceRoleClient();
  if (!admin) return NextResponse.redirect(new URL("/compte?rdvError=insert_failed", origin));

  // Un compte artisan ne se rattache pas un RDV client.
  const { data: artisanSelf } = await admin.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (artisanSelf) return NextResponse.redirect(new URL(tracking, origin));

  const { data: appt } = await admin
    .from("appointments")
    .select("id, artisan_id, customer_user_id, customer_name")
    .eq("id", id)
    .maybeSingle();
  if (!appt) return NextResponse.redirect(new URL("/compte?rdvError=not_found", origin));
  if (appt.customer_user_id && appt.customer_user_id !== user.id) {
    return NextResponse.redirect(new URL("/compte?rdvError=not_found", origin));
  }

  if (!appt.customer_user_id) {
    await admin.from("appointments").update({ customer_user_id: user.id }).eq("id", id).is("customer_user_id", null);
  }

  await admin.from("customer_profiles").upsert(
    {
      user_id: user.id,
      display_name: formatContactDisplayName({ name: (appt.customer_name as string)?.trim(), email: user.email }),
      email: user.email,
    },
    { onConflict: "user_id", ignoreDuplicates: true },
  );

  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("artisan_id", appt.artisan_id)
    .eq("customer_user_id", user.id)
    .maybeSingle();
  if (!conv) {
    await admin.from("conversations").insert({ artisan_id: appt.artisan_id, customer_user_id: user.id });
  }

  return NextResponse.redirect(new URL("/compte?success=rdv", origin));
}
