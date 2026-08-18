import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseMissing } from "@/components/supabase-missing";
import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveVitrineAccent } from "@/lib/vitrine-theme";

import { getOrCreateArtisanCustomerConversation } from "@/lib/contacts/actions";
import { loadLeadMatchQuoteDraft } from "@/lib/leads/quote-draft-actions";
import type { AiQuoteDraft } from "@/lib/ai/quote-draft-storage";

import { QuoteForm } from "../quote-form";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{
    conversationId?: string;
    customerUserId?: string;
    aiDraft?: string;
    draftKey?: string;
    leadMatchId?: string;
  }>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Devis indisponibles" />;
  }

  const sp = await searchParams;
  let conversationIdParam =
    typeof sp.conversationId === "string" && sp.conversationId.length > 0 ? sp.conversationId : undefined;
  const customerUserIdParam =
    typeof sp.customerUserId === "string" && sp.customerUserId.length > 0 ? sp.customerUserId : undefined;
  const leadMatchIdParam =
    typeof sp.leadMatchId === "string" && sp.leadMatchId.length > 0 ? sp.leadMatchId : undefined;
  const draftKeyParam =
    typeof sp.draftKey === "string" && sp.draftKey.length > 0 ? sp.draftKey : undefined;
  const loadAiDraft = sp.aiDraft === "1" && !!(draftKeyParam || conversationIdParam || leadMatchIdParam);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, business_name, slug, accent_color, labor_rate_per_hour")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!profile?.id) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Devis</h1>
        <p className="text-sm text-muted-foreground">Renseigne d’abord ton activité.</p>
        <Link href="/app/reglages?tab=activite" className={buttonVariants({ variant: "outline" })}>
          Mon activité
        </Link>
      </div>
    );
  }

  const { data: services } = await supabase
    .from("services")
    .select("id, title, duration, price")
    .eq("artisan_id", profile.id)
    .order("title", { ascending: true });

  const accent = resolveVitrineAccent(profile.accent_color, profile.business_name);

  const safeServices = (services ?? []) as {
    id: string;
    title: string;
    duration: number;
    price: number | null;
  }[];

  let conversationPrefill: {
    conversationId: string;
    customerUserId?: string | null;
    customerName: string;
    customerEmail: string;
  } | null = null;

  let serverAiDraft: AiQuoteDraft | null = null;

  if (leadMatchIdParam && loadAiDraft) {
    const draftRes = await loadLeadMatchQuoteDraft(leadMatchIdParam);
    if (draftRes.ok) {
      serverAiDraft = draftRes.draft;
      if (draftRes.conversationId) {
        conversationIdParam = draftRes.conversationId;
      }
    }
  }

  if (conversationIdParam) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, artisan_id, customer_user_id")
      .eq("id", conversationIdParam)
      .maybeSingle();
    if (conv && conv.artisan_id === profile.id) {
      if (conv.customer_user_id) {
        const { data: cp } = await supabase
          .from("customer_profiles")
          .select("display_name, email")
          .eq("user_id", conv.customer_user_id)
          .maybeSingle();
        conversationPrefill = {
          conversationId: conv.id,
          customerUserId: conv.customer_user_id,
          customerName: formatContactDisplayName({
            profileName: cp?.display_name,
            email: cp?.email,
          }),
          customerEmail: String((cp as { email?: string | null } | null)?.email ?? ""),
        };
      } else {
        conversationPrefill = {
          conversationId: conv.id,
          customerUserId: null,
          customerName: serverAiDraft?.customerName ?? "",
          customerEmail: serverAiDraft?.customerEmail ?? "",
        };
      }
    }
  } else if (customerUserIdParam) {
    const convRes = await getOrCreateArtisanCustomerConversation(customerUserIdParam);
    const { data: cp } = await supabase
      .from("customer_profiles")
      .select("display_name, email")
      .eq("user_id", customerUserIdParam)
      .maybeSingle();
    if (cp && convRes.ok) {
      conversationPrefill = {
        conversationId: convRes.conversationId,
        customerUserId: customerUserIdParam,
        customerName: formatContactDisplayName({
          profileName: cp.display_name,
          email: cp.email,
        }),
        customerEmail: String(cp.email ?? ""),
      };
    }
  }

  if (!safeServices.length) {
    return (
      <Card className="border-0 shadow-none">
        <CardHeader>
          <CardTitle>Devis</CardTitle>
          <CardDescription>Aucune prestation disponible.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Ajoute d’abord des prestations dans <code>Mes prestations</code>.
          </p>
          <Link href="/app/reglages?tab=prestations" className={buttonVariants()}>
            Aller à mes prestations
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <QuoteForm
      accentColor={accent}
      profileLaborRatePerHourCents={profile.labor_rate_per_hour ?? null}
      services={safeServices}
      conversationPrefill={conversationPrefill}
      loadAiDraft={loadAiDraft}
      aiDraftKey={draftKeyParam ?? conversationIdParam ?? leadMatchIdParam}
      serverAiDraft={serverAiDraft}
    />
  );
}

