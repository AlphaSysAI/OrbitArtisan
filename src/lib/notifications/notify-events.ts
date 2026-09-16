import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyUserActivity } from "@/lib/notifications/send-push";
import { getPublicSiteUrl } from "@/lib/site-url";

const siteUrl = getPublicSiteUrl();

function previewText(body: string, max = 120) {
  const oneLine = body.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

export async function notifyNewMessage(
  supabase: SupabaseClient,
  input: { conversationId: string; senderUserId: string; body: string },
) {
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, artisan_id, customer_user_id")
    .eq("id", input.conversationId)
    .maybeSingle();

  if (!conv) return;

  const { data: artisan } = await supabase
    .from("profiles")
    .select("user_id, business_name")
    .eq("id", conv.artisan_id)
    .maybeSingle();

  const artisanUserId = artisan?.user_id as string | undefined;
  const customerUserId = conv.customer_user_id as string | null;

  if (customerUserId && input.senderUserId === customerUserId && artisanUserId) {
    notifyUserActivity(artisanUserId, {
      title: "Nouveau message",
      body: previewText(input.body),
      url: `${siteUrl}/app/messages/${input.conversationId}`,
      tag: `msg-${input.conversationId}`,
    });
    return;
  }

  if (artisanUserId && input.senderUserId === artisanUserId && customerUserId) {
    notifyUserActivity(customerUserId, {
      title: artisan?.business_name ? `Message de ${artisan.business_name}` : "Nouveau message",
      body: previewText(input.body),
      url: `${siteUrl}/compte/messages/${input.conversationId}`,
      tag: `msg-${input.conversationId}`,
    });
  }
}

export async function notifyLeadToArtisan(
  admin: SupabaseClient,
  input: { artisanId: string; conversationId: string; contactName: string },
) {
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id")
    .eq("id", input.artisanId)
    .maybeSingle();

  const userId = profile?.user_id as string | undefined;
  if (!userId) return;

  notifyUserActivity(userId, {
    title: "Nouvelle demande Soline",
    body: `${input.contactName} vous a contacté via l'estimation.`,
    url: `${siteUrl}/app/messages/${input.conversationId}`,
    tag: `lead-${input.conversationId}`,
  });
}

export async function notifyQuoteAccepted(
  admin: SupabaseClient,
  input: { quoteId: string; artisanId: string; signerName: string },
) {
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id")
    .eq("id", input.artisanId)
    .maybeSingle();

  const userId = profile?.user_id as string | undefined;
  if (!userId) return;

  notifyUserActivity(userId, {
    title: "Devis accepté",
    body: `${input.signerName} a signé votre devis.`,
    url: `${siteUrl}/app/quotes/${input.quoteId}`,
    tag: `quote-accepted-${input.quoteId}`,
  });
}

export async function notifyQuoteRejected(
  admin: SupabaseClient,
  input: { quoteId: string; artisanId: string },
) {
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id")
    .eq("id", input.artisanId)
    .maybeSingle();

  const userId = profile?.user_id as string | undefined;
  if (!userId) return;

  notifyUserActivity(userId, {
    title: "Devis refusé",
    body: "Un client a refusé l'un de vos devis.",
    url: `${siteUrl}/app/quotes/${input.quoteId}`,
    tag: `quote-rejected-${input.quoteId}`,
  });
}

export async function notifyQuoteSentToCustomer(
  supabase: SupabaseClient,
  input: { quoteId: string; customerUserId: string; artisanName: string },
) {
  notifyUserActivity(input.customerUserId, {
    title: "Nouveau devis",
    body: `${input.artisanName} vous a envoyé un devis.`,
    url: `${siteUrl}/mes-devis/${input.quoteId}`,
    tag: `quote-sent-${input.quoteId}`,
  });
}

export async function notifyVoiceIntake(
  admin: SupabaseClient,
  input: { artisanId: string; intakeId: string; customerName?: string | null },
) {
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id")
    .eq("id", input.artisanId)
    .maybeSingle();

  const userId = profile?.user_id as string | undefined;
  if (!userId) return;

  const who = input.customerName?.trim() || "Un appelant";
  notifyUserActivity(userId, {
    title: "Appel Soline traité",
    body: `${who} — proposition de devis à valider.`,
    url: `${siteUrl}/app/appels`,
    tag: `voice-${input.intakeId}`,
  });
}
