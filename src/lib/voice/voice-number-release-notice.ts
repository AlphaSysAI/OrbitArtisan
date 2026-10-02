import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { escapeHtml } from "@/lib/email/html";
import { sendEmail } from "@/lib/email/send-email";
import { notifyUserActivity } from "@/lib/notifications/send-push";
import { getPublicSiteUrl } from "@/lib/site-url";
import { formatPhoneFr } from "@/lib/phone";

/**
 * Prévient l'artisan que son numéro Soline est désactivé (désabonnement, passage en
 * Essentiel, fin d'essai) et lui demande de couper son renvoi d'appel : sinon ses clients
 * tombent sur l'annonce « numéro hors service ». Jamais bloquant.
 */
export async function notifyVoiceNumberReleased(
  admin: SupabaseClient,
  input: { profileId: string; phoneE164: string },
): Promise<void> {
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("user_id, business_name, first_name")
      .eq("id", input.profileId)
      .maybeSingle();
    const userId = profile?.user_id as string | undefined;
    if (!userId) return;

    const number = formatPhoneFr(input.phoneE164);
    const hello = (profile?.first_name as string | null)?.trim();

    notifyUserActivity(userId, {
      title: "Numéro Soline désactivé",
      body: `Pensez à couper le renvoi d'appel vers le ${number}, sinon vos clients entendront « numéro hors service ».`,
      url: `${getPublicSiteUrl()}/app/reglages?tab=vocal`,
      tag: "voice-number-released",
    });

    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (!email) return;

    const res = await sendEmail({
      to: email,
      subject: "Votre numéro Soline est désactivé : coupez votre renvoi d'appel",
      html: `
        <p>Bonjour${hello ? ` ${escapeHtml(hello)}` : ""},</p>
        <p>Votre secrétaire vocale Soline n'est plus incluse dans votre formule : le numéro <strong>${number}</strong> est désactivé.</p>
        <p><strong>Si vous aviez mis en place un renvoi d'appel</strong> de votre ligne vers ce numéro, désactivez-le dès maintenant : sinon, vos clients entendront « ce numéro n'est plus en service » au lieu de pouvoir vous laisser un message.</p>
        <ul>
          <li><strong>Portable</strong> : composez <strong>##002#</strong> puis appel (annule tous les renvois), ou passez par Réglages › Téléphone › Renvoi d'appel.</li>
          <li><strong>Ligne fixe ou box</strong> : depuis l'espace client de votre opérateur, rubrique « renvoi d'appel » (sur beaucoup de lignes : composez <strong>#21#</strong>).</li>
        </ul>
        <p>Vous pouvez réactiver Soline à tout moment depuis vos réglages ; un nouveau numéro vous sera alors attribué.</p>
        <p><a href="${getPublicSiteUrl()}/app/reglages?tab=abonnement">Mon abonnement</a></p>
        <p>Soline</p>`,
      text: `Votre numéro Soline ${number} est désactivé. Si vous aviez un renvoi d'appel vers ce numéro, désactivez-le (portable : ##002# ; fixe : espace client de l'opérateur ou #21#), sinon vos clients entendront « numéro hors service ».`,
    });
    if (!res.ok) console.error("[voice pool] e-mail de désactivation", input.profileId, res.error);
  } catch (error) {
    console.error("[voice pool] prévenir l'artisan", input.profileId, error instanceof Error ? error.message : error);
  }
}
