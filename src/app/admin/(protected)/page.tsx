import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Handshake,
  MailX,
  Phone,
  PhoneOff,
  UserRoundX,
} from "lucide-react";

import { AppPageHeader } from "@/components/app/app-page-header";
import { AdminSetupAlert } from "@/components/admin/admin-setup-alert";
import { fetchAdminDashboard } from "@/lib/admin/tenants";
import { formatCents } from "@/lib/format/money";
import { cn } from "@/lib/utils";

type Todo = { count: number; label: string; hint: string; href: string; icon: typeof AlertTriangle; urgent?: boolean; showCount?: boolean };

function TodoRow({ t }: { t: Todo }) {
  const Icon = t.icon;
  return (
    <li>
      <Link
        href={t.href}
        className={cn(
          "flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60",
          t.urgent && "bg-destructive/5",
        )}
      >
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted", t.urgent && "bg-destructive/10 text-destructive")}>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">
            {t.showCount === false ? null : <span className="tabular-nums">{t.count} </span>}
            {t.label}
          </span>
          <span className="block text-xs text-muted-foreground">{t.hint}</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default async function AdminOverviewPage() {
  const d = await fetchAdminDashboard();
  const m = d.metrics;
  const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

  const todos: Todo[] = [
    {
      count: d.openConciergeAlerts,
      label: plural(d.openConciergeAlerts, "chantier à placer", "chantiers à placer"),
      hint: "Moins de 3 artisans inscrits : prospects à appeler.",
      href: "/admin/conciergerie",
      icon: Handshake,
      urgent: true,
    },
    {
      count: m.pastDue,
      label: plural(m.pastDue, "impayé", "impayés"),
      hint: "Prélèvement échoué : relancer l'artisan.",
      href: "/admin/tenants?vue=past_due",
      icon: CreditCard,
      urgent: true,
    },
    {
      count: m.voiceNumberPending,
      label: plural(m.voiceNumberPending, "numéro Soline en attente", "numéros Soline en attente"),
      hint: "Abonné sans numéro attribué.",
      href: "/admin/tenants?vue=voice_pending",
      icon: PhoneOff,
      urgent: true,
    },
    {
      count: d.voiceNumbersNotReady,
      label: plural(d.voiceNumbersNotReady, "numéro en erreur ElevenLabs", "numéros en erreur ElevenLabs"),
      hint: "Import à relancer dans le stock.",
      href: "/admin/telecom/pool",
      icon: AlertTriangle,
    },
    {
      count: d.readyVoiceNumbers < 2 ? 1 : 0,
      label: `Stock de numéros bas : ${d.readyVoiceNumbers} prêt${d.readyVoiceNumbers > 1 ? "s" : ""}`,
      showCount: false,
      hint: "Les prochains abonnés déclencheront un achat Twilio.",
      href: "/admin/telecom/pool",
      icon: Phone,
    },
    {
      count: m.trialsEndingIn7Days,
      label: plural(m.trialsEndingIn7Days, "essai se termine sous 7 jours", "essais se terminent sous 7 jours"),
      hint: "Vérifier l'usage avant le premier prélèvement.",
      href: "/admin/tenants?vue=trial_ending",
      icon: CalendarClock,
    },
    {
      count: m.noPlanAfterOnboarding,
      label: plural(m.noPlanAfterOnboarding, "inscrit sans formule", "inscrits sans formule"),
      hint: "Compte paramétré mais essai jamais démarré : à relancer.",
      href: "/admin/tenants?vue=incomplete",
      icon: UserRoundX,
    },
    {
      count: d.expiredReferrerInvitations,
      label: plural(d.expiredReferrerInvitations, "invitation apporteur expirée", "invitations apporteur expirées"),
      hint: "À renvoyer ou annuler.",
      href: "/admin/apporteurs",
      icon: MailX,
    },
  ].filter((t) => t.count > 0);

  return (
    <div className="space-y-8">
      {d.issue ? <AdminSetupAlert issue={d.issue} /> : null}
      <AppPageHeader eyebrow="Soline Admin" title="Accueil" description="Ce qui demande une action, puis les chiffres de l'activité." />

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">À faire</h2>
        {todos.length ? (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {todos.map((t) => (
              <TodoRow key={t.href + t.label} t={t} />
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-600" />
            Rien à traiter pour l&apos;instant.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Chiffres</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Abonnés payants"
            value={String(m.paying.total)}
            hint={`Essentiel ${m.paying.byPlan.base} · Pro ${m.paying.byPlan.pro} · Premium ${m.paying.byPlan.premium}`}
          />
          <Stat label="MRR estimé" value={formatCents(m.mrrCents)} hint="Prix catalogue HT (annuel ÷ 12), hors remises et dépassements" />
          <Stat label="Essais en cours" value={String(m.trialing)} hint={`${m.trialsEndingIn7Days} se terminent sous 7 j`} />
          <Stat label="Inscriptions" value={String(m.signups7Days)} hint={`sur 7 jours · ${m.signups30Days} sur 30 jours`} />
          <Stat label="Sans formule" value={String(m.noPlanTotal)} hint={`dont ${m.noPlanAfterOnboarding} paramétrés`} />
          <Stat label="Impayés" value={String(m.pastDue)} hint={`${m.canceled} résilié${m.canceled > 1 ? "s" : ""}`} />
          <Stat label="Comptes suspendus" value={String(m.suspended)} />
          <Stat label="Apporteurs actifs" value={String(d.activeReferrers)} hint={`${d.customersTotal} clients finaux inscrits`} />
        </div>
      </section>
    </div>
  );
}
