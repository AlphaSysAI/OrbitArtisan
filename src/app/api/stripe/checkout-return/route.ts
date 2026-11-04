import { NextResponse } from "next/server";

import { requireAuthenticatedUser, resolveArtisanProfile } from "@/lib/auth/require-artisan";
import { syncSaasSubscriptionFromCheckoutSession } from "@/lib/billing/stripe-checkout-sync";
import { getPublicSiteUrl } from "@/lib/site-url";
import { getStripe } from "@/lib/stripe/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Retour de Stripe Checkout (abonnement). Synchronise l'abonnement tout de
 * suite, sans attendre le webhook, puis renvoie vers la page abonnement. Le
 * webhook reste la source principale ; cette synchronisation est idempotente.
 */
export async function GET(request: Request) {
  const siteUrl = getPublicSiteUrl();
  const done = NextResponse.redirect(`${siteUrl}/app/reglages?tab=abonnement&success=1`);
  const sessionId = new URL(request.url).searchParams.get("session_id")?.trim();
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return done;

  const auth = await requireAuthenticatedUser();
  if (!auth.ok) {
    return NextResponse.redirect(`${siteUrl}/login?next=${encodeURIComponent("/app/reglages?tab=abonnement&success=1")}`);
  }
  const profile = await resolveArtisanProfile(auth.supabase, auth.userId);
  if (!profile.ok) return done;

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    // Seule la session de ce profil peut être synchronisée ici.
    const owner = session.metadata?.profile_id?.trim() || session.client_reference_id?.trim();
    if (owner !== profile.profileId) return done;
    if (session.status !== "complete") return done;
    await syncSaasSubscriptionFromCheckoutSession(createSupabaseAdminClient(), session);
  } catch (error) {
    console.error("[checkout return] synchronisation abonnement", { sessionId, error });
  }
  return done;
}
