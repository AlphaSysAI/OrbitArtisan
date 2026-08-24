import Link from "next/link";
import { Phone } from "lucide-react";

import { AppEmptyState } from "@/components/app/app-empty-state";
import { AppPageHeader } from "@/components/app/app-page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import type { AiQuoteDraft } from "@/lib/ai/quote-draft-storage";
import { estimateDraftTotalCents } from "@/lib/quotes/create-quote-from-ai-draft";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { VoiceIntakeActions } from "./voice-intake-actions";

function formatPhoneE164(raw: string | null | undefined): string {
  if (!raw?.trim()) return "Numéro inconnu";
  const n = raw.trim();
  if (n.startsWith("+33") && n.length >= 11) {
    const local = "0" + n.slice(3);
    return local.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  return n;
}

function formatEur(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function statusBadge(status: string) {
  if (status === "validated") {
    return (
      <Badge variant="outline" className="border-success/40 text-success">
        Devis envoyé
      </Badge>
    );
  }
  if (status === "dismissed") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Ignoré
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
      À valider
    </Badge>
  );
}

export default async function AppelsSolinePage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Appels indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, business_name, labor_rate_per_hour")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!profile?.id) {
    return (
      <div className="space-y-8">
        <AppPageHeader
          eyebrow="Soline"
          title="Appels Soline"
          description="Configure ton activité pour consulter les appels traités par la secrétaire IA."
        />
        <AppEmptyState
          icon={Phone}
          title="Profil artisan requis"
          description="Commence par renseigner ton activité et ton numéro vocal."
          action={
            <Link href="/app/reglages?tab=activite" className={buttonVariants({ size: "lg" })}>
              Aller aux réglages
            </Link>
          }
        />
      </div>
    );
  }

  const { data: intakes, error } = await supabase
    .from("voice_call_intakes")
    .select(
      "id, from_number, customer_name, customer_email, summary, quote_draft, quote_id, status, created_at",
    )
    .eq("artisan_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const items = error ? [] : (intakes ?? []);
  const pendingCount = items.filter((i) => i.status === "pending_review").length;

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Soline"
        title="Appels Soline"
        description={
          pendingCount > 0
            ? `${pendingCount} appel${pendingCount > 1 ? "s" : ""} en attente de validation de devis.`
            : "Historique des appels traités par la secrétaire IA avec proposition de devis."
        }
        action={
          <Link href="/app/reglages?tab=vocal" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Configurer Soline
          </Link>
        }
      />

      {items.length === 0 ? (
        <AppEmptyState
          icon={Phone}
          title="Aucun appel enregistré"
          description="Lorsqu'un client appellera ton numéro Soline, le résumé et la proposition de devis apparaîtront ici."
          action={
            <Link href="/app/reglages?tab=vocal" className={buttonVariants({ size: "lg" })}>
              Configurer le numéro vocal
            </Link>
          }
        />
      ) : (
        <ul className="space-y-4">
          {items.map((item) => {
            const draft = item.quote_draft as AiQuoteDraft | null;
            const estimate = draft ? estimateDraftTotalCents(draft, profile.labor_rate_per_hour) : null;
            const canValidate =
              item.status === "pending_review" &&
              Boolean(item.customer_email) &&
              Boolean(draft?.matchedServiceIds?.length);

            return (
              <li key={item.id} className="app-surface space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold tracking-tight">
                        {formatPhoneE164(item.from_number)}
                      </p>
                      {statusBadge(item.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.customer_name ?? "Client"} · {item.customer_email ?? "—"} · {formatDate(item.created_at)}
                    </p>
                  </div>
                  {estimate != null ? (
                    <p className="text-sm font-medium tabular-nums">{formatEur(estimate)} estimé</p>
                  ) : null}
                </div>

                {item.summary ? (
                  <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Résumé</p>
                    <p className="mt-1 text-sm leading-relaxed">{item.summary}</p>
                  </div>
                ) : null}

                {draft?.notes ? (
                  <div className="rounded-lg border border-brand/20 bg-brand/5 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Proposition de devis
                    </p>
                    <p className="mt-1 text-sm leading-relaxed">{draft.notes}</p>
                    {draft.matchedServiceIds?.length ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {draft.matchedServiceIds.length} prestation(s) · {draft.supplierMaterials?.length ?? 0}{" "}
                        matériau(x)
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                        Aucune prestation associée — édite le devis avant validation.
                      </p>
                    )}
                  </div>
                ) : null}

                {item.status === "pending_review" ? (
                  <VoiceIntakeActions intakeId={item.id} canValidate={canValidate} />
                ) : item.quote_id ? (
                  <Link
                    href={`/app/quotes/${item.quote_id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Voir le devis
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
