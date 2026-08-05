import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
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
    .select("id, artisan_id, customer_user_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv || conv.artisan_id !== profile.id) notFound();

  const { data: cp } = await supabase
    .from("customer_profiles")
    .select("display_name")
    .eq("user_id", conv.customer_user_id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/app/messages" className={buttonVariants({ variant: "outline", size: "sm" })}>
          ← Toutes les conversations
        </Link>
        <Link
          href={`/app/contacts/${conv.customer_user_id}`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          Fiche client
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{cp?.display_name ?? "Client"}</h1>
        <p className="text-sm text-muted-foreground">Conversation</p>
      </div>
      <ArtisanThreadClient conversationId={conversationId} viewerUserId={user!.id} sentOnLeft />
    </div>
  );
}
