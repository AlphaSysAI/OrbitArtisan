"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Clock, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { createAppointmentForLoggedInUser, submitVitrineAppointmentAsGuest } from "./actions";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MORNING_START = 9;
const MORNING_END = 12;
const AFTERNOON_START = 14;
const AFTERNOON_END = 18;

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

/** Créneaux pour un jour donné, espacés selon la durée du service (ex. 45 min → 9h, 9h45, 10h30…). */
function getSlotsForDay(date: Date, durationMinutes: number): string[] {
  const now = new Date();
  const slots: string[] = [];
  const addSlots = (startHour: number, endHour: number) => {
    let minutes = startHour * 60;
    const endMinutes = endHour * 60;
    while (minutes + durationMinutes <= endMinutes) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setMinutes(minutes, 0, 0);
      if (d.getTime() > now.getTime() + 60 * 60 * 1000) {
        slots.push(d.toISOString());
      }
      minutes += durationMinutes;
    }
  };
  addSlots(MORNING_START, MORNING_END);
  addSlots(AFTERNOON_START, AFTERNOON_END);
  return slots;
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
}) {
  const [selectedService, setSelectedService] = React.useState<Service | null>(null);
  const [viewDate, setViewDate] = React.useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);
  const [selectedSlotISO, setSelectedSlotISO] = React.useState<string | null>(null);

  const weeks = React.useMemo(
    () => getCalendarWeeks(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate.getFullYear(), viewDate.getMonth()],
  );

  const slotsForSelectedDay = React.useMemo(() => {
    if (!selectedDate || !selectedService) return [];
    return getSlotsForDay(selectedDate, selectedService.duration);
  }, [selectedDate, selectedService]);

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

    if (viewerUserId) {
      const res = await createAppointmentForLoggedInUser(formData);
      if (!res.ok) {
        toast.error(
          res.error === "missing_fields"
            ? "Merci de remplir tous les champs."
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
      toast.error(
        res.error === "missing_fields"
          ? "Merci de remplir tous les champs."
          : res.error === "pending_failed"
            ? "Impossible d’enregistrer ta demande. Réessaie ou contacte l’assistance."
            : "Impossible de créer le RDV. Réessaie.",
      );
      return;
    }
    if (res.mode === "done") {
      toast.success("Demande envoyée. L’artisan confirmera le RDV.");
      setSelectedDate(null);
      setSelectedSlotISO(null);
    }
    /* Sinon redirect() serveur (connexion ou inscription) — pas de toast ici. */
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
                    const disabled = isPast(day);
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
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customer_phone">
                  Téléphone <span className="text-muted-foreground">(facultatif)</span>
                </Label>
                <Input
                  id="customer_phone"
                  name="customer_phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="06 12 34 56 78"
                />
                <p className="text-xs text-muted-foreground">
                  Permet à l’artisan de te rappeler pour confirmer le créneau.
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
