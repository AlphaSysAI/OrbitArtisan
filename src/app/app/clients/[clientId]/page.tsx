import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarPlus,
  FilePlus2,
  FileText,
  Hammer,
  MessageSquare,
  MessageSquareText,
  Phone,
  PhoneCall,
  Receipt,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";

import { requireArtisanProfileIdOrRedirect } from "@/lib/auth/require-artisan";
import { loadClientTimeline, type TimelineKind, type TimelineTone } from "@/lib/clients/timeline";
import { cn } from "@/lib/utils";

import { ClientComposer, DetachItemButton, EditClientDialog, MergeClientDialog } from "./client-widgets";
import { formatDateTimeFr } from "@/lib/format/date";
import { formatPhoneFr } from "@/lib/phone";

const KIND_ICON: Record<TimelineKind, LucideIcon> = {
  call: PhoneCall,
  message: MessageSquareText,
  quote: FileText,
  invoice: Receipt,
  appointment: CalendarClock,
  project: Hammer,
  callback: Phone,
};

const TONE: Record<TimelineTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  danger: "bg-red-500/10 text-red-700 dark:text-red-300",
};

function when(iso: string) {
  return formatDateTimeFr(iso, { dateStyle: "medium", timeStyle: "short" });
}

export default async function ClientFichePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) notFound();
  const { supabase, profileId, userId } = await requireArtisanProfileIdOrRedirect([], `/login?next=/app/clients/${clientId}`);

  const { data: client } = await supabase
    .from("clients")
    .select("id, display_name, phone, email, customer_user_id, address_line1, postal_code, city, created_at")
    .eq("id", clientId)
    .eq("artisan_id", profileId)
    .maybeSingle();
  if (!client) notFound();

  const [{ items, todos }, { data: others }] = await Promise.all([
    loadClientTimeline(supabase, clientId, userId),
    supabase
      .from("clients")
      .select("id, display_name, phone, email")
      .eq("artisan_id", profileId)
      .neq("id", clientId)
      .order("last_activity_at", { ascending: false })
      .limit(300),
  ]);

  const phone = client.phone as string | null;
  const email = client.email as string | null;
  const address = [client.address_line1, [client.postal_code, client.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const channel = client.customer_user_id ? "account" : email ? "email" : "none";
  const rdvHref = `/app/rdv?new=1&name=${encodeURIComponent(client.display_name as string)}${email ? `&email=${encodeURIComponent(email)}` : ""}${phone ? `&phone=${encodeURIComponent(phone)}` : ""}`;

  const action = "flex h-16 flex-col items-center justify-center gap-1 rounded-xl border bg-card text-xs font-semibold hover:bg-muted/50";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/app/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Clients
      </Link>

      <section className="app-surface space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{client.display_name as string}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[formatPhoneFr(phone), email].filter(Boolean).join(" · ") || "Aucune coordonnée"}
            </p>
            {address ? <p className="text-sm text-muted-foreground">{address}</p> : null}
            {client.customer_user_id ? (
              <Link href={`/app/contacts/${client.customer_user_id}`} className="mt-1 inline-block text-xs text-muted-foreground underline underline-offset-4">
                Compte Soline du client
              </Link>
            ) : null}
          </div>
          <EditClientDialog
            clientId={clientId}
            defaults={{
              display_name: client.display_name as string,
              phone,
              email,
              address_line1: client.address_line1 as string | null,
              postal_code: client.postal_code as string | null,
              city: client.city as string | null,
            }}
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {phone ? (
            <a href={`tel:${phone}`} className={action}>
              <Phone className="size-5" /> Appeler
            </a>
          ) : (
            <span className={cn(action, "opacity-40")} aria-disabled>
              <Phone className="size-5" /> Appeler
            </span>
          )}
          {channel !== "none" ? (
            <a href="#message" className={action}>
              <MessageSquare className="size-5" /> Message
            </a>
          ) : phone ? (
            <a href={`sms:${phone}`} className={action}>
              <MessageSquare className="size-5" /> SMS
            </a>
          ) : (
            <span className={cn(action, "opacity-40")} aria-disabled>
              <MessageSquare className="size-5" /> Message
            </span>
          )}
          <Link href={`/app/quotes/new?clientId=${clientId}`} className={action}>
            <FilePlus2 className="size-5" /> Devis
          </Link>
          <Link href={rdvHref} className={action}>
            <CalendarPlus className="size-5" /> RDV
          </Link>
        </div>
      </section>

      {todos.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">À faire pour ce client</h2>
          <ul className="space-y-2">
            {todos.map((t) => (
              <li key={t.key}>
                <Link href={t.href} className={cn("flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium", TONE[t.tone])}>
                  {t.label}
                  <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="app-surface p-4">
        <ClientComposer clientId={clientId} channel={channel} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Historique</h2>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Rien pour l&apos;instant. Appels, messages, devis, factures et rendez-vous de ce client s&apos;afficheront ici.
          </p>
        ) : (
          <ol className="relative space-y-3 border-l pl-6">
            {items.map((it) => {
              const Icon = KIND_ICON[it.kind];
              return (
                <li key={it.key} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[34px] top-3 flex size-7 items-center justify-center rounded-full border bg-background",
                      it.kind === "message" && it.fromClient && "border-brand text-brand",
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <div className={cn("rounded-xl border bg-card p-3.5", it.kind === "message" && !it.fromClient && "bg-muted/40")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {it.href ? (
                          <Link href={it.href} className="font-medium underline-offset-4 hover:underline">
                            {it.title}
                          </Link>
                        ) : (
                          <span className="font-medium">{it.title}</span>
                        )}
                        {it.badge ? (
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", TONE[it.badge.tone])}>{it.badge.label}</span>
                        ) : null}
                      </div>
                      <time className="text-xs text-muted-foreground" dateTime={it.at}>
                        {when(it.at)}
                      </time>
                    </div>
                    {it.detail ? <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">{it.detail}</p> : null}
                    {it.detachable ? (
                      <div className="mt-2 text-right">
                        <DetachItemButton clientId={clientId} table={it.detachable.table} itemId={it.detachable.id} />
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="flex justify-center border-t pt-4">
        <MergeClientDialog
          clientId={clientId}
          clientName={client.display_name as string}
          candidates={(others ?? []).map((o) => ({
            id: o.id as string,
            name: o.display_name as string,
            hint: [formatPhoneFr(o.phone as string | null), o.email].filter(Boolean).join(" · ") || "sans coordonnées",
          }))}
        />
      </div>
    </div>
  );
}
