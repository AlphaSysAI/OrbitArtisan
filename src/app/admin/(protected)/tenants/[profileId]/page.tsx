import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { AdminTenantVoiceCard } from "@/components/admin/admin-tenant-voice-card";
import { TenantAccessActions, TenantPlanForm, TenantProfileForm } from "@/components/admin/tenant-actions";
import { SubscriptionBadges } from "@/components/admin/ui/subscription-badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { getAdminDb } from "@/lib/admin/db";
import { auditActionLabel, SUBSCRIPTION_HINT, type AdminSubscriptionStatus } from "@/lib/admin/labels";
import { getAdminTenantDetail } from "@/lib/admin/tenants";
import { formatDateFr, formatDateTimeFr } from "@/lib/format/date";
import { formatPhoneFr } from "@/lib/phone";
import { isProvisionalSlug } from "@/lib/profile/provisional-slug";
import { getPublicSiteUrl } from "@/lib/site-url";
import { formatTradeLabel } from "@/lib/trades/taxonomy";

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[150px_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

const stripeUrl = (kind: "customers" | "subscriptions", id: string) => `https://dashboard.stripe.com/${kind}/${id}`;

export default async function AdminTenantDetailPage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) notFound();
  const t = await getAdminTenantDetail(profileId);
  if (!t) notFound();

  const db = getAdminDb();
  const { data: voice } = db
    ? await db.from("artisan_voice_numbers").select("phone_e164").eq("artisan_id", profileId).maybeSingle()
    : { data: null };
  const voicePhone = (voice?.phone_e164 as string | undefined) ?? null;
  const tradeLabel = t.tradeCategory && t.trade ? formatTradeLabel(t.tradeCategory, t.trade) : null;
  const name = t.businessName.trim() || "Inscription en cours";

  return (
    <div className="space-y-5">
      <Link href="/admin/tenants" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}>
        ← Artisans
      </Link>

      <header className="space-y-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[t.name, t.email, t.phone ? formatPhoneFr(t.phone) : null].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <SubscriptionBadges status={t.subscriptionStatus} plan={t.subscriptionPlan} trialEndsAt={t.trialEndsAt} accountStatus={t.accountStatus} deletedAt={t.deletedAt} />
        <TenantAccessActions
          profileId={t.id}
          email={t.email}
          accountStatus={t.accountStatus}
          archived={Boolean(t.deletedAt)}
          businessName={t.businessName}
        />
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Abonnement">
          <p className="text-sm text-muted-foreground">{SUBSCRIPTION_HINT[t.subscriptionStatus as AdminSubscriptionStatus]}</p>
          <dl className="space-y-2">
            {t.subscriptionStatus === "trialing" && t.trialEndsAt ? <Info label="Fin de l'essai">{formatDateFr(t.trialEndsAt)}</Info> : null}
            <Info label="Client Stripe">
              {t.stripeCustomerId ? (
                <a href={stripeUrl("customers", t.stripeCustomerId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
                  Ouvrir dans Stripe <ExternalLink className="size-3" />
                </a>
              ) : (
                "—"
              )}
            </Info>
            <Info label="Abonnement Stripe">
              {t.stripeSubscriptionId ? (
                <a href={stripeUrl("subscriptions", t.stripeSubscriptionId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
                  Ouvrir dans Stripe <ExternalLink className="size-3" />
                </a>
              ) : (
                "—"
              )}
            </Info>
          </dl>
          <details className="rounded-xl border p-3">
            <summary className="cursor-pointer text-sm font-medium">Corriger l&apos;état en base</summary>
            <div className="mt-3">
              <TenantPlanForm profileId={t.id} plan={t.subscriptionPlan} status={t.subscriptionStatus} />
            </div>
          </details>
        </Section>

        <Section title="Numéro Soline">
          {t.voiceNumberPendingAt ? (
            <p className="rounded-lg bg-amber-500/10 p-2 text-sm text-amber-800 dark:text-amber-200">
              En attente d&apos;attribution depuis le {formatDateTimeFr(t.voiceNumberPendingAt)}.
            </p>
          ) : null}
          <AdminTenantVoiceCard profileId={t.id} currentPhoneE164={voicePhone} />
        </Section>

        <Section title="Entreprise">
          <dl className="space-y-2">
            <Info label="Métier">{tradeLabel ?? "Non renseigné"}</Info>
            <Info label="SIREN / SIRET">{[t.siren, t.siret].filter(Boolean).join(" / ") || "—"}</Info>
            <Info label="Adresse">{t.address ?? "—"}</Info>
            <Info label="TVA">{t.vatRegime === "franchise" ? "Franchise (293 B)" : t.vatRegime === "normal" ? "Assujetti" : "—"}</Info>
            <Info label="Paramétrage">
              {t.onboardingCompletedAt ? `Terminé le ${formatDateFr(t.onboardingCompletedAt)}` : "En cours"}
            </Info>
            <Info label="Vitrine">
              {t.slug && !isProvisionalSlug(t.slug) ? (
                <a href={`${getPublicSiteUrl()}/site/${t.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
                  /site/{t.slug} <ExternalLink className="size-3" />
                </a>
              ) : (
                "Pas encore publiée"
              )}
            </Info>
          </dl>
          <details className="rounded-xl border p-3">
            <summary className="cursor-pointer text-sm font-medium">Modifier la fiche</summary>
            <div className="mt-3">
              <TenantProfileForm
                profileId={t.id}
                initial={{ business_name: t.businessName, name: t.name ?? "", phone: t.phone ?? "", siren: t.siren ?? "", siret: t.siret ?? "" }}
              />
            </div>
          </details>
        </Section>

        <Section title="Activité">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Devis</p>
              <p className="font-display text-2xl font-semibold tabular-nums">{t.quotesCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Factures</p>
              <p className="font-display text-2xl font-semibold tabular-nums">{t.invoicesCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Inscrit le</p>
              <p className="font-medium">{formatDateFr(t.createdAt)}</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Historique admin</p>
            {t.history.length ? (
              <ul className="divide-y rounded-xl border text-sm">
                {t.history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                    <span>{auditActionLabel(h.action)}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTimeFr(h.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune action admin sur ce compte.</p>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
