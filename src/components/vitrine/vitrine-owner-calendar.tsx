"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Clock, Mail, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export type VitrineOwnerAppointment = {
  id: string;
  start_time: string;
  customer_name: string;
  customer_email: string;
  status: "pending" | "confirmed" | "cancelled";
  service_id: string | null;
};

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

function statusLabel(status: VitrineOwnerAppointment["status"]) {
  switch (status) {
    case "confirmed":
      return "Confirmé";
    case "cancelled":
      return "Annulé";
    case "pending":
    default:
      return "En attente";
  }
}

export function VitrineOwnerCalendar({
  appointments,
  services,
  accentColor,
}: {
  appointments: VitrineOwnerAppointment[];
  services: ServiceLite[];
  accentColor: string;
}) {
  const [viewDate, setViewDate] = React.useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);

  const serviceTitleById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const s of services) m.set(s.id, s.title);
    return m;
  }, [services]);

  const daysWithAppointment = React.useMemo(() => {
    const set = new Set<string>();
    for (const a of appointments) {
      set.add(dayKeyLocal(new Date(a.start_time)));
    }
    return set;
  }, [appointments]);

  const appointmentsForSelectedDay = React.useMemo(() => {
    if (!selectedDate) return [];
    return appointments
      .filter((a) => isSameDay(new Date(a.start_time), selectedDate))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [appointments, selectedDate]);

  const weeks = React.useMemo(
    () => getCalendarWeeks(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate],
  );

  const monthLabel = React.useMemo(
    () =>
      viewDate.toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
      }),
    [viewDate],
  );

  const accent = accentColor;
  const accentSelected = (active: boolean) =>
    accent && active
      ? { backgroundColor: accent, borderColor: accent, color: "#fff" as const }
      : undefined;

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="pb-2">
        <CardDescription>
          Les jours avec au moins un RDV sont marqués d’un point rouge. Cliquez sur une date pour afficher le planning du jour.
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
              if (!day) {
                return <div key={`empty-${i}`} className="h-10 w-10 shrink-0" aria-hidden />;
              }
              const key = dayKeyLocal(day);
              const hasRdv = daysWithAppointment.has(key);
              const selected = selectedDate && isSameDay(day, selectedDate);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg text-sm transition-colors",
                    "hover:bg-muted",
                    !accent && selected && "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                  style={accentSelected(!!selected)}
                  aria-label={
                    day.toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }) + (hasRdv ? " — rendez-vous" : "")
                  }
                >
                  <span>{day.getDate()}</span>
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full", hasRdv ? "bg-red-500" : "bg-transparent")}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/80 p-4">
          {!selectedDate ? (
            <p className="text-center text-sm text-muted-foreground">
              Sélectionnez un jour dans le calendrier pour afficher le planning.
            </p>
          ) : (
            <>
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900">
                <Clock className="h-4 w-4 shrink-0" style={{ color: accent }} />
                {selectedDate.toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              {appointmentsForSelectedDay.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun rendez-vous ce jour-là.</p>
              ) : (
                <ul className="space-y-3">
                  {appointmentsForSelectedDay.map((a) => {
                    const t = new Date(a.start_time);
                    const timeStr = t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                    const serviceTitle = a.service_id ? serviceTitleById.get(a.service_id) : null;
                    return (
                      <li
                        key={a.id}
                        className={cn(
                          "rounded-lg border bg-white p-3 text-sm shadow-sm",
                          a.status === "cancelled" && "opacity-60",
                        )}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-semibold tabular-nums text-neutral-900">{timeStr}</span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              a.status === "confirmed" && "bg-emerald-100 text-emerald-800",
                              a.status === "pending" && "bg-amber-100 text-amber-900",
                              a.status === "cancelled" && "bg-neutral-200 text-neutral-600",
                            )}
                          >
                            {statusLabel(a.status)}
                          </span>
                        </div>
                        <p className="mt-2 flex items-center gap-2 text-neutral-800">
                          <User className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                          {a.customer_name}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-xs text-neutral-600">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          {a.customer_email}
                        </p>
                        {serviceTitle && (
                          <p className="mt-2 text-xs text-neutral-500">Prestation : {serviceTitle}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
