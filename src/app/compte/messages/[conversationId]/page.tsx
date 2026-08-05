import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ArtisanThreadClient } from "@/app/app/messages/[conversationId]/thread-client";

export default async function ClientConversationPage({
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
  if (!user) notFound();

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, artisan_id, customer_user_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv || conv.customer_user_id !== user.id) notFound();

  const { data: artisan } = await supabase
    .from("profiles")
    .select("business_name")
    .eq("id", conv.artisan_id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/compte/messages" className={buttonVariants({ variant: "outline", size: "sm" })}>
          ← Toutes les conversations
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{artisan?.business_name ?? "Artisan"}</h1>
        <p className="text-sm text-muted-foreground">Conversation</p>
      </div>
      <ArtisanThreadClient
        conversationId={conversationId}
        viewerUserId={user.id}
        showQuoteShortcut={false}
      />
    </div>
  );
}
