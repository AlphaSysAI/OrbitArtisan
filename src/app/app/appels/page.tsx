import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, Phone, Search } from "lucide-react";

import { AppEmptyState } from "@/components/app/app-empty-state";
import { AppPageHeader } from "@/components/app/app-page-header";
import { VoiceQuotaRecap } from "@/components/settings/voice-quota-recap";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import type { AiQuoteDraft } from "@/lib/ai/quote-draft-storage";
import { computeDraftTotals } from "@/lib/quotes/create-quote-from-ai-draft";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveVoiceQuota } from "@/lib/voice/resolve-voice-quota";
import {
  buildVoiceInboxSearch,
  matchVoiceAppointments,
  parseVoiceInboxLimit,
  parseVoiceInboxTab,
  VOICE_INBOX_MAX_LIMIT,
  VOICE_INBOX_PAGE_SIZE,
  type VoiceInboxTab,
} from "@/lib/voice/voice-intake-inbox";
import { cn } from "@/lib/utils";
import { planIncludesSolineVoice, SOLINE_SUBSCRIPTION_SETTINGS_HREF } from "@/lib/voice/soline-voice-access";

import { VoiceIntakeActions, VoiceIntakeArchiveButton } from "./voice-intake-actions";
import { VoiceIntakeCard } from "./voice-intake-card";

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
        Sans suite
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
      À traiter
    </Badge>
  );
}

type AppelsSearchParams = { tab?: string | string[]; q?: string | string[]; limit?: string | string[] };

export default async function AppelsSolinePage({ searchParams }: { searchParams: Promise<AppelsSearchParams> }) {
  const sp = await searchParams;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Appels indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, business_name, labor_rate_per_hour, subscription_plan, vat_regime")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (profile?.id && !planIncludesSolineVoice(profile.subscription_plan)) {
    redirect(SOLINE_SUBSCRIPTION_SETTINGS_HREF);
  }

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

  const tab = parseVoiceInboxTab(sp.tab);
  const limit = parseVoiceInboxLimit(sp.limit);
  const search = buildVoiceInboxSearch(sp.q);
  const searching = Boolean(search.text || search.phoneDigits);
  const rawQuery = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? "";

  let listQuery = supabase
    .from("voice_call_intakes")
    .select(
      "id, from_number, customer_name, customer_email, summary, quote_draft, quote_id, status, created_at, is_urgent, urgency_reason, read_at, archived_at",
    )
    .eq("artisan_id", profile.id);

  if (searching) {
    // La recherche couvre tous les onglets (« c'est moi qui ai appelé mardi »).
    if (search.phoneDigits) listQuery = listQuery.ilike("from_number", `%${search.phoneDigits}%`);
    if (search.text) {
      const p = `%${search.text}%`;
      listQuery = listQuery.or(`customer_name.ilike.${p},customer_email.ilike.${p},summary.ilike.${p}`);
    }
  } else if (tab === "a_traiter") {
    listQuery = listQuery.eq("status", "pending_review").order("is_urgent", { ascending: false });
  } else if (tab === "devis") {
    listQuery = listQuery.eq("status", "validated").is("archived_at", null);
  } else {
    listQuery = listQuery.not("archived_at", "is", null);
  }

  const countQuery = (status: "pending_review" | "validated") => {
    let q = supabase
      .from("voice_call_intakes")
      .select("id", { count: "exact", head: true })
      .eq("artisan_id", profile.id)
      .eq("status", status);
    if (status === "validated") q = q.is("archived_at", null);
    return q;
  };

  const [{ data: intakes, error }, { count: pendingCount }, { count: devisCount }, voiceQuota] = await Promise.all([
    listQuery.order("created_at", { ascending: false }).limit(limit),
    countQuery("pending_review"),
    countQuery("validated"),
    resolveVoiceQuota(supabase, profile.id),
  ]);

  const items = error ? [] : (intakes ?? []);
  const hasMore = items.length === limit && limit < VOICE_INBOX_MAX_LIMIT;

  // Durées réelles des prestations, chargées une fois pour tout l'artisan : sert à
  // calculer l'aperçu avec la même fonction que la création réelle du devis
  // (point "fidélité preview" audit pré-pilote, vague 4).
  const phones = [...new Set(items.map((i) => i.from_number).filter((n): n is string => Boolean(n)))];
  const [{ data: artisanServices }, { data: voiceAppointments }] = await Promise.all([
    supabase.from("services").select("id, duration").eq("artisan_id", profile.id),
    phones.length
      ? supabase
          .from("appointments")
          .select("id, customer_phone, created_at, start_time, status")
          .eq("artisan_id", profile.id)
          .eq("source", "voice")
          .neq("status", "cancelled")
          .in("customer_phone", phones)
      : Promise.resolve({ data: [] as { id: string; customer_phone: string | null; created_at: string; start_time: string; status: string }[] }),
  ]);
  const serviceDurationsById = new Map((artisanServices ?? []).map((s) => [s.id as string, (s.duration as number) ?? 0]));
  const appointmentByIntake = matchVoiceAppointments(items, voiceAppointments ?? []);

  function formatDuration(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m}`;
  }

  function tabHref(t: VoiceInboxTab) {
    return t === "a_traiter" ? "/app/appels" : `/app/appels?tab=${t}`;
  }

  const moreParams = new URLSearchParams();
  if (!searching && tab !== "a_traiter") moreParams.set("tab", tab);
  if (rawQuery) moreParams.set("q", rawQuery);
  moreParams.set("limit", String(limit + VOICE_INBOX_PAGE_SIZE));

  const tabs: { key: VoiceInboxTab; label: string; count?: number | null }[] = [
    { key: "a_traiter", label: "À traiter", count: pendingCount },
    { key: "devis", label: "Devis", count: devisCount },
    { key: "archives", label: "Archivés" },
  ];

  const emptyByTab: Record<VoiceInboxTab, { title: string; description: string }> = {
    a_traiter: {
      title: "Rien à traiter",
      description: "Les nouveaux appels reçus par Soline apparaîtront ici avec leur résumé et la proposition de devis.",
    },
    devis: { title: "Aucun devis issu d'un appel", description: "Les appels validés en devis sont rangés ici." },
    archives: {
      title: "Aucun appel archivé",
      description: "Les appels classés sans suite ou archivés sont conservés ici et peuvent être restaurés.",
    },
  };

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Soline"
        title="Appels Soline"
        description={
          (pendingCount ?? 0) > 0
            ? `${pendingCount} appel${(pendingCount ?? 0) > 1 ? "s" : ""} à traiter.`
            : "Historique des appels traités par la secrétaire IA avec proposition de devis."
        }
        action={
          <Link href="/app/reglages?tab=vocal" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Configurer Soline
          </Link>
        }
      />

      {voiceQuota ? <VoiceQuotaRecap quota={voiceQuota} /> : null}

      <div className="space-y-3">
        <form action="/app/appels" method="get" role="search" className="flex gap-2">
          <label htmlFor="appels-q" className="sr-only">
            Rechercher un appel
          </label>
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="appels-q"
              name="q"
              type="search"
              inputMode="search"
              defaultValue={rawQuery}
              placeholder="Nom, numéro, mot du résumé…"
              className="h-11 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
            />
          </div>
          <button type="submit" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Chercher
          </button>
        </form>

        {searching ? (
          <p className="text-sm text-muted-foreground">
            Résultats pour « {rawQuery} » dans tous les appels ·{" "}
            <Link href={tabHref(tab)} className="font-medium text-foreground underline underline-offset-4">
              Effacer
            </Link>
          </p>
        ) : (
          <nav aria-label="Classement des appels" className="flex gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
            {tabs.map((t) => {
              const active = t.key === tab;
              return (
                <Link
                  key={t.key}
                  href={tabHref(t.key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors",
                    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  {t.count ? (
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-xs tabular-nums",
                        t.key === "a_traiter" ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {t.count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {items.length === 0 ? (
        searching ? (
          <AppEmptyState icon={Search} title="Aucun appel trouvé" description="Essaie avec un autre nom ou numéro." />
        ) : (
          <AppEmptyState
            icon={tab === "archives" ? Archive : Phone}
            title={emptyByTab[tab].title}
            description={emptyByTab[tab].description}
          />
        )
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const draft = item.quote_draft as AiQuoteDraft | null;
            const totals = draft ? computeDraftTotals(draft, profile.labor_rate_per_hour, serviceDurationsById) : null;
            const isPending = item.status === "pending_review";
            const urgent = Boolean(item.is_urgent) && isPending;
            const unread = isPending && !item.read_at;
            const archived = Boolean(item.archived_at);
            const appointment = appointmentByIntake.get(item.id);
            const canValidate =
              isPending &&
              Boolean(item.customer_email) &&
              Boolean(
                draft?.matchedServiceIds?.length ||
                (draft?.laborDurationMinutes ?? 0) > 0 ||
                (draft?.laborTotalOverrideCents ?? 0) > 0 ||
                draft?.supplierMaterials?.length,
              );

            const header = (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p data-title className="text-base font-semibold tracking-tight">
                    {item.customer_name?.trim() || formatPhoneE164(item.from_number)}
                  </p>
                  {statusBadge(item.status)}
                  {urgent ? (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Urgent</span>
                  ) : null}
                  {appointment ? (
                    <Badge variant="outline" className="border-brand/40 text-brand">
                      RDV {formatDate(appointment.start_time)}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {item.customer_name?.trim() ? `${formatPhoneE164(item.from_number)} · ` : ""}
                  {formatDate(item.created_at)}
                  {totals != null ? ` · ${formatEur(totals.grandTotalCents)} estimé` : ""}
                </p>
                {urgent && item.urgency_reason ? (
                  <p className="text-sm font-medium text-red-700">{item.urgency_reason}</p>
                ) : item.summary ? (
                  <p className="line-clamp-2 text-sm text-foreground/80">{item.summary}</p>
                ) : null}
              </div>
            );

            return (
              <VoiceIntakeCard key={item.id} intakeId={item.id} unread={unread} urgent={urgent} header={header}>
                <p className="text-sm text-muted-foreground">
                  {item.customer_name ?? "Client"} · {item.customer_email ?? "—"} ·{" "}
                  {item.from_number ? (
                    <a href={`tel:${item.from_number.replace(/[^\d+]/g, "")}`} className="font-medium text-foreground underline underline-offset-4">
                      {formatPhoneE164(item.from_number)}
                    </a>
                  ) : (
                    "Numéro inconnu"
                  )}
                </p>

                {item.summary ? (
                  <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Résumé</p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{item.summary}</p>
                  </div>
                ) : null}

                {draft?.notes ? (
                  <div className="rounded-lg border border-brand/20 bg-brand/5 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Proposition de devis
                    </p>
                    <p className="mt-1 text-sm leading-relaxed">{draft.notes}</p>
                    {draft.matchedServiceIds?.length && totals ? (
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>
                          Main d&apos;œuvre : {formatDuration(totals.laborDurationMinutes)} — {formatEur(totals.laborTotalCents)}
                        </p>
                        {totals.materialLines.map((m, i) => (
                          <p key={i}>
                            {m.quantity} × {m.label}
                            {m.excludeFromInvoice ? " (hors facture)" : ` — ${formatEur(m.lineTotalCents)}`}
                          </p>
                        ))}
                      </div>
                    ) : draft.matchedServiceIds?.length ? (
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

                {appointment ? (
                  <Link href="/app/rdv" className="inline-block text-sm font-medium text-brand underline underline-offset-4">
                    Rendez-vous pris pendant l&apos;appel : {formatDate(appointment.start_time)}
                  </Link>
                ) : null}

                {isPending ? (
                  <VoiceIntakeActions intakeId={item.id} canValidate={canValidate} canUndo={Boolean(draft?.previous)} vatFranchise={profile.vat_regime === "franchise"} />
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {item.quote_id ? (
                      <Link
                        href={`/app/quotes/${item.quote_id}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Voir le devis
                      </Link>
                    ) : null}
                    <VoiceIntakeArchiveButton intakeId={item.id} mode={archived ? "restore" : "archive"} />
                  </div>
                )}
              </VoiceIntakeCard>
            );
          })}
        </ul>
      )}

      {hasMore ? (
        <div className="flex justify-center">
          <Link href={`/app/appels?${moreParams.toString()}`} className={buttonVariants({ variant: "outline" })} scroll={false}>
            Afficher plus
          </Link>
        </div>
      ) : null}
    </div>
  );
}
