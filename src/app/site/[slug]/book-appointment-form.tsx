"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Clock, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_VISIT_HOURS,
  isOpenDay,
  slotsForParisDay,
  VISIT_TIMEZONE,
  type VisitHours,
} from "@/lib/appointments/visit-hours";
import type { BusyInterval } from "@/lib/vitrine/slot-overlap";

function ymdOf(date: Date) {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

import { createAppointmentForLoggedInUser, submitVitrineAppointmentAsGuest } from "./actions";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
type Service = {
  id: string;
  title: string;
  duration: number;
  price: number | null;
};

function formatPrice(price: number | null) {
  if (price == null) return "Sur devis";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(price / 100);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isPast(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
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

export function BookAppointmentForm({
  artisanId,
  slug,
  services,
  demoMode = false,
  accentColor,
  viewerUserId,
  busySlots = [],
  visitHours = DEFAULT_VISIT_HOURS,
}: {
  artisanId: string;
  slug: string;
  services: Service[];
  slotISO?: string[];
  demoMode?: boolean;
  /** Couleur d’accent vitrine (hex) — boutons et sélections. */
  accentColor?: string;
  /** Si connecté : RDV lié au compte sans redirection auth. */
  viewerUserId?: string | null;
  /** Horaires déjà réservés chez l'artisan : jamais proposés. */
  busySlots?: BusyInterval[];
  /** Plages de rendez-vous de l'artisan (heure de Paris) : mêmes plages que Soline. */
  visitHours?: VisitHours;
}) {
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [takenNow, setTakenNow] = React.useState<BusyInterval[]>([]);
  const [selectedService, setSelectedService] = React.useState<Service | null>(null);
  const [viewDate, setViewDate] = React.useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);
  const [selectedSlotISO, setSelectedSlotISO] = React.useState<string | null>(null);

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();
  const weeks = React.useMemo(
    () => getCalendarWeeks(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const slotsForSelectedDay = React.useMemo(() => {
    if (!selectedDate || !selectedService) return [];
    const busy = [...busySlots, ...takenNow].map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
    return slotsForParisDay({
      ymd: ymdOf(selectedDate),
      hours: visitHours,
      durationMinutes: selectedService.duration,
      busy,
      now: new Date(),
    }).map((d) => d.toISOString());
  }, [selectedDate, selectedService, busySlots, takenNow, visitHours]);

  const monthLabel = React.useMemo(
    () =>
      viewDate.toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
      }),
    [viewDate],
  );

  function selectService(service: Service) {
    setSelectedService(service);
    setSelectedDate(null);
    setSelectedSlotISO(null);
  }

  async function onSubmit(formData: FormData) {
    if (demoMode) {
      toast.message("Mode démo", {
        description:
          "Ce formulaire est désactivé en démo. Crée un profil Supabase avec un vrai slug pour activer les RDV.",
      });
      return;
    }
    if (!selectedSlotISO || !selectedService) return;
    formData.set("start_time", selectedSlotISO);
    formData.set("service_id", selectedService.id);

    const slotStart = selectedSlotISO;
    const slotDuration = selectedService.duration;
    // Créneau pris entre-temps : on le retire tout de suite de la liste.
    const markTaken = () => {
      setTakenNow((prev) => [
        ...prev,
        { start: slotStart, end: new Date(new Date(slotStart).getTime() + slotDuration * 60_000).toISOString() },
      ]);
      setSelectedSlotISO(null);
    };

    if (viewerUserId) {
      const res = await createAppointmentForLoggedInUser(formData);
      if (!res.ok) {
        if (res.error === "slot_taken") markTaken();
        toast.error(
          res.error === "missing_fields"
            ? "Merci de remplir tous les champs."
            : res.error === "slot_taken"
              ? "Ce créneau vient d’être réservé par quelqu’un d’autre. Choisis un autre horaire."
              : res.error === "invalid_slot"
                ? "Ce créneau n’est plus proposé. Choisis un autre horaire."
                : res.error === "rate_limited"
                  ? "Trop de demandes depuis cette connexion. Réessaie dans une heure."
                  : "Impossible de créer le RDV. Réessaie.",
        );
        return;
      }
      toast.success("Demande enregistrée sur ton compte. L’artisan confirmera le RDV.");
      setSelectedDate(null);
      setSelectedSlotISO(null);
      return;
    }

    const res = await submitVitrineAppointmentAsGuest(formData);
    if (!res.ok) {
      if (res.error === "slot_taken") markTaken();
      toast.error(
        res.error === "missing_fields"
          ? "Merci de remplir tous les champs."
          : res.error === "slot_taken"
            ? "Ce créneau vient d’être réservé par quelqu’un d’autre. Choisis un autre horaire."
            : res.error === "invalid_email"
              ? "Adresse e-mail invalide : elle sert à suivre ta demande."
              : res.error === "invalid_phone"
                ? "Numéro de téléphone invalide : l’artisan en a besoin pour te rappeler."
              : res.error === "invalid_slot"
                ? "Ce créneau n’est plus proposé. Choisis un autre horaire."
                : res.error === "rate_limited"
                  ? "Trop de demandes depuis cette connexion. Réessaie dans une heure."
                  : "Impossible de créer le RDV. Réessaie.",
      );
      return;
    }
    const email = String(formData.get("customer_email") ?? "").trim();
    setSentTo(email || "ton adresse e-mail");
    setSelectedDate(null);
    setSelectedSlotISO(null);
  }

  const canSubmit = !!selectedSlotISO && !!selectedService;
  const accent = accentColor;

  const accentSelected = (active: boolean) =>
    accent && active
      ? { backgroundColor: accent, borderColor: accent, color: "#fff" as const }
      : undefined;

  if (!services.length) {
    return (
      <Card className="border-0 shadow-none">
        <CardHeader>
          <CardTitle>Prendre rendez‑vous</CardTitle>
          <CardDescription>Aucun service n’est proposé pour le moment.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (sentTo) {
    return (
      <Card className="border-0 shadow-none">
        <CardHeader>
          <CardTitle className="text-xl">Demande envoyée ✓</CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Le créneau vous est réservé en attendant la confirmation de l’artisan. Un e-mail vient
            d’être envoyé à <strong className="text-foreground">{sentTo}</strong> avec un bouton « Suivre ma
            demande » : vous serez prévenu dès que l’artisan aura confirmé.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={() => setSentTo(null)}>
            Faire une autre demande
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader>
        <CardTitle className="text-xl">Prendre rendez‑vous</CardTitle>
        <CardDescription>
          Un service, une date, un horaire — les créneaux suivent la durée de la prestation choisie.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form action={onSubmit} className="grid gap-6">
          <input type="hidden" name="artisan_id" value={artisanId} />
          <input type="hidden" name="slug" value={slug} />
          {selectedService && <input type="hidden" name="service_id" value={selectedService.id} />}

          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Scissors className="h-4 w-4" />
              Choisir un service
            </Label>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => {
                const selected = selectedService?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => selectService(s)}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                      "hover:bg-muted/80",
                      !accent && selected && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                      !accent && !selected && "border-border bg-card",
                      accent && !selected && "border-border bg-card",
                    )}
                    style={accentSelected(!!selected)}
                  >
                    <span className="block font-medium">{s.title}</span>
                    <span className="block text-xs opacity-80">
                      {s.duration} min · {formatPrice(s.price)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedService && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Date</Label>
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
                  <span className="min-w-[140px] text-center text-sm font-medium capitalize">
                    {monthLabel}
                  </span>
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
                    <div key={label} className="flex size-9 items-center justify-center font-medium">
                      {label}
                    </div>
                  ))}
                  {weeks.flat().map((day, i) => {
                    if (!day) {
                      return <div key={`empty-${i}`} className="size-9 shrink-0" aria-hidden />;
                    }
                    const disabled = isPast(day) || !isOpenDay(visitHours, ymdOf(day));
                    const selected = selectedDate && isSameDay(day, selectedDate);
                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return;
                          setSelectedDate(day);
                          setSelectedSlotISO(null);
                        }}
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg text-sm transition-colors",
                          disabled && "cursor-not-allowed opacity-40",
                          !disabled && "hover:bg-muted",
                          !accent && selected && "bg-primary text-primary-foreground hover:bg-primary/90",
                        )}
                        style={accentSelected(!!selected)}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {selectedDate && selectedService && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4" />
                Créneaux disponibles le{" "}
                {selectedDate.toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}{" "}
                (créneaux de {selectedService.duration} min)
              </Label>
              {slotsForSelectedDay.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun créneau disponible ce jour. Choisis une autre date.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slotsForSelectedDay.map((iso) => {
                    const selected = selectedSlotISO === iso;
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setSelectedSlotISO(iso)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                          !accent && selected && "border-primary bg-primary text-primary-foreground",
                          !accent && !selected && "border-border hover:bg-muted",
                          accent && !selected && "border-border hover:bg-muted",
                        )}
                        style={accentSelected(!!selected)}
                      >
                        {new Date(iso).toLocaleTimeString("fr-FR", {
                          timeZone: VISIT_TIMEZONE,
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {canSubmit && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="customer_name">Nom</Label>
                <Input id="customer_name" name="customer_name" placeholder="Prénom Nom" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customer_email">Adresse e-mail</Label>
                <Input
                  id="customer_email"
                  name="customer_email"
                  type="email"
                  placeholder="toi@email.fr"
                  required
                />
                {!viewerUserId ? (
                  <p className="text-xs text-muted-foreground">
                    Pas besoin de compte : tu recevras un lien pour suivre ou annuler ta demande.
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customer_phone">
                  Téléphone{" "}
                  {viewerUserId ? <span className="text-muted-foreground">(facultatif)</span> : null}
                </Label>
                <Input
                  id="customer_phone"
                  name="customer_phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="06 12 34 56 78"
                  required={!viewerUserId}
                  minLength={viewerUserId ? undefined : 10}
                />
                <p className="text-xs text-muted-foreground">
                  Pour que l’artisan puisse te rappeler au sujet du rendez-vous.
                </p>
              </div>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                style={accent ? { backgroundColor: accent, color: "#fff" } : undefined}
              >
                Envoyer la demande
              </Button>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
