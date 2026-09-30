import { NextResponse, type NextRequest } from "next/server";

import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { verifyQuoteResponseToken } from "@/lib/quotes/response-link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/**
 * Rattache un devis reçu par e-mail au compte client connecté. Le lien signé (reçu
 * dans la boîte du client) fait office de preuve — jamais sur simple saisie d'e-mail.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const origin = request.nextUrl.origin;
  const page = `/devis/reponse/${token}`;

  const id = verifyQuoteResponseToken(token);
  if (!id) return NextResponse.redirect(new URL(page, origin));

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(`/login?role=particulier&next=${encodeURIComponent(`${page}/rattacher`)}`, origin),
    );
  }

  const admin = createSupabaseServiceRoleClient();
  if (!admin) return NextResponse.redirect(new URL(page, origin));

  const { data: artisanSelf } = await admin.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (artisanSelf) return NextResponse.redirect(new URL(page, origin));

  const { data: quote } = await admin
    .from("quotes")
    .select("id, artisan_id, status, customer_user_id, customer_name, client_id")
    .eq("id", id)
    .maybeSingle();
  if (!quote || quote.status === "draft") return NextResponse.redirect(new URL(page, origin));
  if (quote.customer_user_id && quote.customer_user_id !== user.id) return NextResponse.redirect(new URL(page, origin));

  await admin.from("customer_profiles").upsert(
    {
      user_id: user.id,
      display_name: formatContactDisplayName({ name: (quote.customer_name as string | null)?.trim(), email: user.email }),
      email: user.email,
    },
    { onConflict: "user_id", ignoreDuplicates: true },
  );

  // Conversation compte ↔ artisan (celle d'un invité, s'il y en a une, reste visible côté artisan).
  let { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("artisan_id", quote.artisan_id)
    .eq("customer_user_id", user.id)
    .maybeSingle();
  if (!conv) {
    ({ data: conv } = await admin
      .from("conversations")
      .insert({ artisan_id: quote.artisan_id, customer_user_id: user.id, client_id: quote.client_id })
      .select("id")
      .single());
  }

  if (!quote.customer_user_id) {
    await admin
      .from("quotes")
      .update({ customer_user_id: user.id, conversation_id: conv?.id ?? null })
      .eq("id", id)
      .is("customer_user_id", null);
  }
  if (quote.client_id) {
    // Fiche client ← compte (ignoré si ce compte est déjà rattaché à une autre fiche de l'artisan).
    await admin.from("clients").update({ customer_user_id: user.id }).eq("id", quote.client_id).is("customer_user_id", null);
  }

  return NextResponse.redirect(new URL(`/mes-devis/${id}`, origin));
}
