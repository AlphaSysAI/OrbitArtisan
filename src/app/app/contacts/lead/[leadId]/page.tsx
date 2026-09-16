import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, MessageSquare, Phone } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseMissing } from "@/components/supabase-missing";
import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { artisanCanViewLead } from "@/lib/contacts/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function ArtisanLeadContactPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Fiche prospect indisponible" />;
  }

  const { leadId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user!.id).maybeSingle();
  if (!profile?.id) notFound();

  const allowed = await artisanCanViewLead(leadId);
  if (!allowed) notFound();

  const [{ data: lead }, { data: conversation }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, contact_name, contact_email, contact_phone, address_label, trade, trade_category, description, estimate_min, estimate_max, status, claimed_by_user_id",
      )
      .eq("id", leadId)
      .maybeSingle(),
    supabase
      .from("conversations")
      .select("id")
      .eq("artisan_id", profile.id)
      .eq("lead_id", leadId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!lead) notFound();

  const label = formatContactDisplayName({
    name: lead.contact_name,
    email: lead.contact_email,
    fallback: "Prospect Soline",
  });

  const formatEur = (cents: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);

  const estimate =
    lead.estimate_min != null && lead.estimate_max != null
      ? `${formatEur(lead.estimate_min)} – ${formatEur(lead.estimate_max)}`
      : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/contacts" className={buttonVariants({ variant: "outline", size: "sm" })}>
          ← Contacts
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prospect Soline</p>
          <h1 className="text-2xl font-semibold tracking-tight">{label}</h1>
          {lead.contact_email ? (
            <p className="mt-1 text-sm text-muted-foreground">{lead.contact_email}</p>
          ) : null}
          {lead.contact_phone ? (
            <a
              href={`tel:${lead.contact_phone.replace(/\s/g, "")}`}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary"
            >
              <Phone className="size-4" />
              {lead.contact_phone}
            </a>
          ) : null}
        </div>
        {conversation?.id ? (
          <Link
            href={`/app/messages/${conversation.id}`}
            className={cn(buttonVariants({ size: "default" }), "gap-2")}
          >
            <MessageSquare className="size-4" />
            Ouvrir la conversation
          </Link>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Demande</CardTitle>
            <CardDescription>Détails transmis via Soline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {lead.trade || lead.trade_category ? (
              <p>
                <span className="text-muted-foreground">Corps de métier : </span>
                {[lead.trade_category, lead.trade].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            {lead.address_label ? (
              <p>
                <span className="text-muted-foreground">Lieu : </span>
                {lead.address_label}
              </p>
            ) : null}
            {estimate ? (
              <p>
                <span className="text-muted-foreground">Estimation indicative : </span>
                {estimate}
              </p>
            ) : null}
            {lead.description ? (
              <p className="whitespace-pre-wrap leading-relaxed">{lead.description}</p>
            ) : (
              <p className="text-muted-foreground">Aucune description.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              Suite
            </CardTitle>
            <CardDescription>
              {lead.claimed_by_user_id
                ? "Ce prospect a créé un compte client."
                : "Compte client non encore créé — échange via la messagerie."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {conversation?.id ? (
              <Link
                href={`/app/messages/${conversation.id}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex gap-2")}
              >
                <MessageSquare className="size-4" />
                Voir les messages
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune conversation liée pour l’instant.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
