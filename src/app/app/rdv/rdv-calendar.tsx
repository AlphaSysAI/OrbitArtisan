"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Clock, Loader2, Mail, Phone, User, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { appointmentStatusLabel } from "@/lib/status-labels";
import { cn } from "@/lib/utils";

import { cancelAppointment, confirmAppointment, type ArtisanAppointment } from "./actions";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

type ServiceLite = { id: string; title: string };

function dayKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getCalendarWeeks(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = last.getDate();
  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

export function RdvCalendar({
  appointments,
  services,
  initialDateIso,
}: {
  appointments: ArtisanAppointment[];
  services: ServiceLite[];
  /** Date ISO YYYY-MM-DD (ex. depuis ?date=) */
  initialDateIso?: string | null;
}) {
  const router = useRouter();
  const initial = React.useMemo(() => {
    if (initialDateIso && /^\d{4}-\d{2}-\d{2}$/.test(initialDateIso)) {
      const [y, m, d] = initialDateIso.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  }, [initialDateIso]);

  const [viewDate, setViewDate] = React.useState(() => {
    const d = new Date(initial);
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(() => initial);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!initialDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(initialDateIso)) return;
    const [y, m, d] = initialDateIso.split("-").map(Number);
    const next = new Date(y, m - 1, d);
    setSelectedDate(next);
    setViewDate(new Date(y, m - 1, 1));
  }, [initialDateIso]);

  const serviceTitleById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const s of services) m.set(s.id, s.title);
    return m;
  }, [services]);

  // Un jour est marqué s'il porte au moins un RDV non annulé.
  const dayMarkers = React.useMemo(() => {
    const map = new Map<string, { hasPending: boolean; hasConfirmed: boolean }>();
    for (const a of appointments) {
      if (a.status === "cancelled") continue;
      const key = dayKeyLocal(new Date(a.start_time));
      const prev = map.get(key) ?? { hasPending: false, hasConfirmed: false };
      if (a.status === "pending") prev.hasPending = true;
      if (a.status === "confirmed") prev.hasConfirmed = true;
      map.set(key, prev);
    }
    return map;
  }, [appointments]);

  const appointmentsForSelectedDay = React.useMemo(() => {
    if (!selectedDate) return [];
    return appointments
      .filter((a) => isSameDay(new Date(a.start_time), selectedDate))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [appointments, selectedDate]);

  const pendingCount = React.useMemo(
    () => appointments.filter((a) => a.status === "pending").length,
    [appointments],
  );

  const weeks = React.useMemo(
    () => getCalendarWeeks(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate],
  );

  const monthLabel = React.useMemo(
    () => viewDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
    [viewDate],
  );

  async function onDecision(id: string, decision: "confirm" | "cancel") {
    setPendingId(id);
    const res = decision === "confirm" ? await confirmAppointment(id) : await cancelAppointment(id);
    setPendingId(null);
    if (!res.ok) {
      toast.error(res.error === "not_found" ? "Ce rendez-vous est introuvable." : "Action impossible. Réessaie.");
      return;
    }
    toast.success(decision === "confirm" ? "Rendez-vous confirmé" : "Rendez-vous refusé");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>
          {pendingCount > 0 ? (
            <>
              <span className="font-medium text-foreground">{pendingCount}</span> rendez-vous en attente de
              validation. Les jours avec un RDV en attente portent un point ambré, confirmés un point vert.
            </>
          ) : (
            "Aucun rendez-vous en attente. Cliquez sur une date pour voir le planning du jour."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Calendrier</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              aria-label="Mois précédent"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[140px] text-center text-sm font-medium capitalize">{monthLabel}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              aria-label="Mois suivant"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mx-auto w-fit max-w-full rounded-xl border bg-muted/30 p-2">
          <div className="grid w-fit grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="flex h-10 items-center justify-center font-medium">
                {label}
              </div>
            ))}
            {weeks.flat().map((day, i) => {
              if (!day) return <div key={`empty-${i}`} className="h-10 w-10 shrink-0" aria-hidden />;
              const key = dayKeyLocal(day);
              const marker = dayMarkers.get(key);
              const selected = selectedDate && isSameDay(day, selectedDate);
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg text-sm transition-colors",
                    "hover:bg-muted",
                    selected && "bg-primary text-primary-foreground hover:bg-primary/90",
                    !selected && isToday && "ring-1 ring-primary/40",
                  )}
                  aria-label={
                    day.toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }) + (marker ? " — rendez-vous" : "")
                  }
                >
                  <span>{day.getDate()}</span>
                  <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                    {marker?.hasPending && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                    {marker?.hasConfirmed && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-dashed bg-muted/20 p-4">
          {!selectedDate ? (
            <p className="text-center text-sm text-muted-foreground">
              Sélectionnez un jour dans le calendrier pour afficher le planning.
            </p>
          ) : (
            <>
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="capitalize">
                  {selectedDate.toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </p>
              {appointmentsForSelectedDay.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun rendez-vous ce jour-là.</p>
              ) : (
                <ul className="space-y-3">
                  {appointmentsForSelectedDay.map((a) => (
                    <AppointmentRow
                      key={a.id}
                      appointment={a}
                      serviceTitle={a.service_id ? serviceTitleById.get(a.service_id) ?? null : null}
                      busy={pendingId === a.id}
                      onConfirm={() => onDecision(a.id, "confirm")}
                      onCancel={() => onDecision(a.id, "cancel")}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AppointmentRow({
  appointment: a,
  serviceTitle,
  busy,
  onConfirm,
  onCancel,
}: {
  appointment: ArtisanAppointment;
  serviceTitle: string | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = new Date(a.start_time);
  const timeStr = t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <li className={cn("rounded-lg border bg-card p-3 text-sm shadow-sm", a.status === "cancelled" && "opacity-60")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold tabular-nums">{timeStr}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            a.status === "confirmed" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
            a.status === "pending" && "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
            a.status === "cancelled" && "bg-muted text-muted-foreground",
          )}
        >
          {appointmentStatusLabel(a.status)}
        </span>
      </div>

      <p className="mt-2 flex items-center gap-2">
        <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {a.customer_name}
      </p>
      <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <Mail className="h-3.5 w-3.5 shrink-0" />
        {a.customer_email}
      </p>
      {serviceTitle && <p className="mt-2 text-xs text-muted-foreground">Prestation : {serviceTitle}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {a.customer_phone && (
          <a
            href={`tel:${a.customer_phone}`}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted",
            )}
          >
            <Phone className="h-3.5 w-3.5" />
            Appeler {a.customer_phone}
          </a>
        )}

        {a.status !== "confirmed" && (
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Valider
          </Button>
        )}

        {a.status !== "cancelled" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-destructive hover:text-destructive"
            disabled={busy}
            onClick={onCancel}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Refuser
          </Button>
        )}
      </div>
    </li>
  );
}
