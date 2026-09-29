import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileText,
  MapPin,
  MessageSquare,
  Phone,
  Receipt,
  Store,
} from "lucide-react";

import { finalizePendingVitrineAppointment } from "@/app/site/[slug]/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { VISIT_TIMEZONE } from "@/lib/appointments/visit-hours";
import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { appointmentStatusLabel } from "@/lib/status-labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTrade, findTradeCategory } from "@/lib/trades/taxonomy";
import { cn } from "@/lib/utils";

type Artisan = {
  id: string;
  business_name: string;
  slug: string | null;
  phone: string | null;
  logo_url: string | null;
  trade_category: string | null;
  trade: string | null;
};

type Appointment = {
  id: string;
  start_time: string;
  status: "pending" | "confirmed" | "cancelled";
  artisan_id: string;
  services: { title: string } | { title: string }[] | null;
};

const RDV_ERROR_LABELS: Record<string, string> = {
  slot_taken:
    "Ce créneau vient d’être réservé par quelqu’un d’autre entre-temps. Reprends contact avec l’artisan pour un autre horaire.",
  expired: "Cette demande de rendez-vous a expiré (délai de 7 jours dépassé). Reprends contact avec l’artisan.",
  email_mismatch: "Cette demande de rendez-vous a été faite avec une autre adresse e-mail.",
  not_found: "Cette demande de rendez-vous est introuvable ou a déjà été traitée.",
  unauthorized: "Connecte-toi pour finaliser cette demande de rendez-vous.",
  insert_failed: "Le rendez-vous n’a pas pu être enregistré. Réessaie ou contacte l’artisan.",
};

function euros(cents: number | null | undefined) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);
}

/** RDV commencé il y a moins de 2 h : encore affiché comme « à venir ». */
function recentCutoffIso() {
  return new Date(Date.now() - 2 * 3_600_000).toISOString();
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function whenLabel(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: VISIT_TIMEZONE, ...opts }).format(new Date(iso));
}

function tradeLabel(a: Artisan | undefined) {
  if (!a) return null;
  return findTrade(a.trade_category, a.trade)?.label ?? findTradeCategory(a.trade_category)?.label ?? null;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export default async function CompteHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pending = typeof sp.pending === "string" ? sp.pending : undefined;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Anciens liens (demande mise en attente avant inscription).
  if (pending) {
    const result = await finalizePendingVitrineAppointment(pending);
    if (result.ok) redirect("/compte?success=rdv");
    redirect(`/compte?rdvError=${result.error}`);
  }

  const nowIso = recentCutoffIso();

  const [cpRes, quotesRes, invoicesRes, upcomingRes, pastRes, convRes] = await Promise.all([
    supabase.from("customer_profiles").select("display_name, email").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("quotes")
      .select("id, status, grand_total, artisan_id, sent_at, created_at")
      .eq("customer_user_id", user.id)
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("invoices")
      .select("id, status, grand_total, artisan_id, invoice_number, due_date")
      .eq("customer_user_id", user.id)
      .in("status", ["sent", "overdue"])
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("appointments")
      .select("id, start_time, status, artisan_id, services ( title )")
      .eq("customer_user_id", user.id)
      .neq("status", "cancelled")
      .gte("start_time", nowIso)
      .order("start_time", { ascending: true })
      .limit(10),
    supabase
      .from("appointments")
      .select("id, start_time, status, artisan_id, services ( title )")
      .eq("customer_user_id", user.id)
      .lt("start_time", nowIso)
      .order("start_time", { ascending: false })
      .limit(5),
    supabase.from("conversations").select("id, artisan_id").eq("customer_user_id", user.id),
  ]);

  const quotesToReview = quotesRes.data ?? [];
  const invoicesToPay = invoicesRes.data ?? [];
  const upcoming = (upcomingRes.data ?? []) as Appointment[];
  const past = (pastRes.data ?? []) as Appointment[];
  const conversations = convRes.data ?? [];
  const conversationByArtisan = new Map(conversations.map((c) => [c.artisan_id as string, c.id as string]));

  const artisanIds = [
    ...new Set(
      [
        ...conversations.map((c) => c.artisan_id),
        ...upcoming.map((a) => a.artisan_id),
        ...past.map((a) => a.artisan_id),
        ...quotesToReview.map((q) => q.artisan_id),
        ...invoicesToPay.map((i) => i.artisan_id),
      ].filter(Boolean) as string[],
    ),
  ];
  const { data: artisanRows } = artisanIds.length
    ? await supabase
        .from("artisan_public_profiles")
        .select("id, business_name, slug, phone, logo_url, trade_category, trade")
        .in("id", artisanIds)
    : { data: [] as Artisan[] };
  const artisans = (artisanRows ?? []) as Artisan[];
  const artisanById = new Map(artisans.map((a) => [a.id, a]));
  const nameOf = (id: string) => artisanById.get(id)?.business_name ?? "Artisan";

  const displayName = formatContactDisplayName({
    profileName: cpRes.data?.display_name,
    email: cpRes.data?.email,
    fallback: "",
  });
  const firstName = displayName.split(/\s+/)[0] || "";

  const rdvErrorRaw = typeof sp.rdvError === "string" ? sp.rdvError : undefined;
  const rdvErrorLabel = rdvErrorRaw ? (RDV_ERROR_LABELS[rdvErrorRaw] ?? RDV_ERROR_LABELS.insert_failed) : null;

  const nextRdv = upcoming[0] ?? null;
  const pendingRdvs = upcoming.filter((a) => a.status === "pending");
  const todoCount = quotesToReview.length + invoicesToPay.length;
  const isNew = !artisans.length && !upcoming.length && !past.length && !todoCount;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Bonjour{firstName ? ` ${firstName}` : ""}
        </h1>
        <p className="text-muted-foreground">
          {todoCount > 0
            ? `${todoCount} chose${todoCount > 1 ? "s" : ""} attend${todoCount > 1 ? "ent" : ""} votre réponse.`
            : nextRdv
              ? `Prochain rendez-vous ${whenLabel(nextRdv.start_time, { weekday: "long", day: "numeric", month: "long" })}.`
              : "Vos rendez-vous, devis, factures et échanges avec vos artisans, au même endroit."}
        </p>
      </header>

      {sp.success === "rdv" ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Demande rattachée à votre compte</AlertTitle>
          <AlertDescription>Vous pouvez maintenant écrire à l’artisan et suivre vos rendez-vous ici.</AlertDescription>
        </Alert>
      ) : null}
      {rdvErrorLabel ? (
        <Alert variant="destructive">
          <AlertTitle>Rendez-vous non enregistré</AlertTitle>
          <AlertDescription>{rdvErrorLabel}</AlertDescription>
        </Alert>
      ) : null}

      {isNew ? (
        <section className="rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-10">
          <Store className="mx-auto size-10 text-primary" aria-hidden />
          <h2 className="mt-4 text-lg font-semibold">Bienvenue dans votre espace</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Dès que vous prenez rendez-vous ou recevez un devis d’un artisan, tout apparaît ici : dates,
            documents à signer, factures et messagerie.
          </p>
          <Link href="/compte/recherche" className={buttonVariants({ size: "lg", className: "mt-6 gap-2" })}>
            <MapPin className="size-4" />
            Trouver un artisan près de chez moi
          </Link>
        </section>
      ) : null}

      {todoCount > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">À faire</h2>
          <ul className="space-y-2">
            {quotesToReview.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/mes-devis/${q.id}`}
                  className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FileText className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">Devis à consulter — {nameOf(q.artisan_id)}</span>
                    <span className="block text-sm text-muted-foreground">
                      {euros(q.grand_total)} HT · à accepter ou refuser en ligne
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
            {invoicesToPay.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={`/compte/factures/${inv.id}`}
                  className={cn(
                    "flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40",
                    inv.status === "overdue" && "border-destructive/40",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl",
                      inv.status === "overdue" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
                    )}
                  >
                    <Receipt className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      Facture à régler — {nameOf(inv.artisan_id)}
                      {inv.status === "overdue" ? " (en retard)" : ""}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {euros(inv.grand_total)}
                      {inv.due_date ? ` · échéance le ${new Date(inv.due_date).toLocaleDateString("fr-FR")}` : ""}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : !isNew ? (
        <p className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-600" />
          Rien à faire pour l’instant : aucun devis ni facture en attente.
        </p>
      ) : null}

      {nextRdv ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Prochain rendez-vous
          </h2>
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex gap-4 p-5">
              <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 py-2 text-primary">
                <span className="text-xs font-semibold uppercase">
                  {whenLabel(nextRdv.start_time, { month: "short" })}
                </span>
                <span className="text-2xl font-bold leading-none">{whenLabel(nextRdv.start_time, { day: "numeric" })}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold capitalize">
                  {whenLabel(nextRdv.start_time, { weekday: "long", hour: "2-digit", minute: "2-digit" })}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {nameOf(nextRdv.artisan_id)}
                  {one(nextRdv.services)?.title ? ` · ${one(nextRdv.services)?.title}` : ""}
                </p>
                <span
                  className={cn(
                    "mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    nextRdv.status === "confirmed"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
                  )}
                >
                  {nextRdv.status === "confirmed" ? "Confirmé" : "En attente de confirmation"}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 border-t">
              {conversationByArtisan.get(nextRdv.artisan_id) ? (
                <Link
                  href={`/compte/messages/${conversationByArtisan.get(nextRdv.artisan_id)}`}
                  className="flex h-12 items-center justify-center gap-2 text-sm font-medium hover:bg-muted/50"
                >
                  <MessageSquare className="size-4" />
                  Écrire
                </Link>
              ) : (
                <span className="flex h-12 items-center justify-center text-sm text-muted-foreground">—</span>
              )}
              {artisanById.get(nextRdv.artisan_id)?.phone ? (
                <a
                  href={`tel:${artisanById.get(nextRdv.artisan_id)?.phone}`}
                  className="flex h-12 items-center justify-center gap-2 border-l text-sm font-medium hover:bg-muted/50"
                >
                  <Phone className="size-4" />
                  Appeler
                </a>
              ) : (
                <span className="flex h-12 items-center justify-center border-l text-sm text-muted-foreground">—</span>
              )}
            </div>
          </div>
          {pendingRdvs.length && nextRdv.status !== "pending" ? (
            <p className="text-sm text-muted-foreground">
              {pendingRdvs.length} autre{pendingRdvs.length > 1 ? "s" : ""} demande{pendingRdvs.length > 1 ? "s" : ""} en
              attente de confirmation.
            </p>
          ) : null}
        </section>
      ) : null}

      {artisans.length ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Mes artisans</h2>
            <Link href="/compte/recherche" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Trouver un artisan
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {artisans.map((a) => {
              const conv = conversationByArtisan.get(a.id);
              return (
                <li key={a.id} className="flex flex-col rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    {a.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.logo_url} alt="" className="size-11 rounded-xl border object-cover" />
                    ) : (
                      <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-sm font-semibold">
                        {initials(a.business_name)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.business_name}</p>
                      {tradeLabel(a) ? <p className="truncate text-xs text-muted-foreground">{tradeLabel(a)}</p> : null}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {conv ? (
                      <Link href={`/compte/messages/${conv}`} className={buttonVariants({ size: "sm", className: "gap-1.5" })}>
                        <MessageSquare className="size-3.5" />
                        Écrire
                      </Link>
                    ) : null}
                    {a.slug ? (
                      <Link
                        href={`/site/${a.slug}`}
                        className={buttonVariants({ size: "sm", variant: "outline", className: "gap-1.5" })}
                      >
                        <CalendarClock className="size-3.5" />
                        Prendre RDV
                      </Link>
                    ) : null}
                    {a.phone ? (
                      <a href={`tel:${a.phone}`} className={buttonVariants({ size: "sm", variant: "ghost", className: "gap-1.5" })}>
                        <Phone className="size-3.5" />
                        Appeler
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {upcoming.length > 1 || past.length ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Mes rendez-vous</h2>
          <ul className="divide-y rounded-2xl border bg-card">
            {upcoming.slice(1).map((a) => (
              <RdvRow key={a.id} appt={a} artisanName={nameOf(a.artisan_id)} />
            ))}
          </ul>
          {past.length ? (
            <details className="rounded-2xl border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Rendez-vous passés</summary>
              <ul className="divide-y border-t">
                {past.map((a) => (
                  <RdvRow key={a.id} appt={a} artisanName={nameOf(a.artisan_id)} muted />
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      <nav className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Raccourcis">
        {[
          { href: "/mes-devis", label: "Mes devis", icon: FileText },
          { href: "/compte/factures", label: "Mes factures", icon: Receipt },
          { href: "/compte/messages", label: "Messages", icon: MessageSquare },
          { href: "/compte/recherche", label: "Trouver un artisan", icon: MapPin },
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-2 rounded-2xl border bg-card px-3 py-4 text-center text-sm font-medium shadow-sm transition-colors hover:bg-muted/40"
          >
            <Icon className="size-5 text-primary" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function RdvRow({ appt, artisanName, muted = false }: { appt: Appointment; artisanName: string; muted?: boolean }) {
  const service = one(appt.services)?.title;
  return (
    <li className={cn("flex items-center justify-between gap-3 px-4 py-3 text-sm", muted && "text-muted-foreground")}>
      <div className="min-w-0">
        <p className="font-medium capitalize">
          {whenLabel(appt.start_time, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
        <p className="truncate text-muted-foreground">
          {artisanName}
          {service ? ` · ${service}` : ""}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{appointmentStatusLabel(appt.status)}</span>
    </li>
  );
}
