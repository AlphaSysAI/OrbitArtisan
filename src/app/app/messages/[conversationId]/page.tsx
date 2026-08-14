import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { findLeadMatchForConversation } from "@/lib/leads/quote-draft-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ArtisanThreadClient } from "./thread-client";

export default async function ArtisanConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Messages indisponibles" />;
  }

  const { conversationId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user!.id).maybeSingle();
  if (!profile) notFound();

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, artisan_id, customer_user_id, lead_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv || conv.artisan_id !== profile.id) notFound();

  let displayName = "Client";
  if (conv.lead_id) {
    const { data: lead } = await supabase
      .from("leads")
      .select("contact_name")
      .eq("id", conv.lead_id)
      .maybeSingle();
    displayName = lead?.contact_name?.trim() || "Demande Soline";
  } else if (conv.customer_user_id) {
    const { data: cp } = await supabase
      .from("customer_profiles")
      .select("display_name")
      .eq("user_id", conv.customer_user_id)
      .maybeSingle();
    displayName = cp?.display_name ?? "Client";
  }

  const leadMatch = await findLeadMatchForConversation(conversationId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/app/messages" className={buttonVariants({ variant: "outline", size: "sm" })}>
          ← Toutes les conversations
        </Link>
        {conv.customer_user_id ? (
          <Link
            href={`/app/contacts/${conv.customer_user_id}`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Fiche client
          </Link>
        ) : null}
        {leadMatch.ok && leadMatch.quoteDraftCreated ? (
          <Link
            href={`/app/quotes/new?leadMatchId=${encodeURIComponent(leadMatch.leadMatchId)}&aiDraft=1&conversationId=${encodeURIComponent(conversationId)}`}
            className={buttonVariants({ size: "sm" })}
          >
            Voir le devis IA préparé
          </Link>
        ) : null}
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
        <p className="text-sm text-muted-foreground">
          {conv.lead_id ? "Demande qualifiée reçue via Soline" : "Conversation"}
        </p>
      </div>
      <ArtisanThreadClient
        conversationId={conversationId}
        viewerUserId={user!.id}
        sentOnLeft
        leadMatchId={leadMatch.ok ? leadMatch.leadMatchId : undefined}
        leadQuoteReady={leadMatch.ok && leadMatch.quoteDraftCreated}
      />
    </div>
  );
}
