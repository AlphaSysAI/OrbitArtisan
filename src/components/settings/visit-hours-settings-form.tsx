"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveVisitHours } from "@/features/voice/actions";
import {
  emptyVisitHours,
  ISO_WEEKDAYS,
  parseVisitHours,
  VISIT_DURATION_OPTIONS,
  WEEKDAY_LABELS,
  type IsoWeekday,
  type VisitHours,
} from "@/lib/appointments/visit-hours";

const DEFAULT_RANGE = { start: "17:00", end: "19:00" };

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

export function VisitHoursSettingsForm({
  initialHours,
  initialDurationMinutes,
}: {
  initialHours: VisitHours | null;
  initialDurationMinutes: number;
}) {
  const [hours, setHours] = useState<VisitHours>(initialHours ?? emptyVisitHours());
  const [duration, setDuration] = useState(initialDurationMinutes);
  const [pending, startTransition] = useTransition();

  function update(day: IsoWeekday, index: number, key: "start" | "end", value: string) {
    setHours((prev) => ({
      ...prev,
      [day]: prev[day].map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    }));
  }

  function addRange(day: IsoWeekday) {
    setHours((prev) => ({ ...prev, [day]: [...prev[day], DEFAULT_RANGE] }));
  }

  function removeRange(day: IsoWeekday, index: number) {
    setHours((prev) => ({ ...prev, [day]: prev[day].filter((_, i) => i !== index) }));
  }

  function handleSave() {
    const parsed = parseVisitHours(hours);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    startTransition(async () => {
      const result = await saveVisitHours({ hours: parsed.value, durationMinutes: duration });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Plages de visite enregistrées.");
    });
  }

  const active = ISO_WEEKDAYS.some((d) => hours[d].length > 0);

  return (
    <div className="space-y-5 rounded-2xl border border-border/70 bg-muted/30 p-5">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1">
          <h3 className="font-display text-lg font-semibold tracking-tight">Rendez-vous pris par Soline</h3>
          <p className="text-sm text-muted-foreground">
            Soline propose au client 3 créneaux libres dans ces plages (heure de Paris, au plus tôt 2 h après
            l&apos;appel). Le RDV bloque le créneau et vous arrive « à valider » : sans validation sous 24 h, il
            est annulé. Le client reçoit un SMS dès que vous validez.
          </p>
          {!active ? (
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              Aucune plage : Soline ne propose pas de RDV, elle prend les coordonnées et vous rappelez.
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="visit-duration">Durée d&apos;une visite</Label>
        <select
          id="visit-duration"
          className="h-10 rounded-lg border bg-background px-3 text-sm"
          value={duration}
          disabled={pending}
          onChange={(event) => setDuration(Number(event.target.value))}
        >
          {VISIT_DURATION_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {durationLabel(m)}
            </option>
          ))}
        </select>
      </div>

      <ul className="divide-y rounded-xl border bg-card">
        {ISO_WEEKDAYS.map((day) => (
          <li key={day} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <span className="w-24 pt-2 text-sm font-medium">{WEEKDAY_LABELS[day]}</span>
            <div className="flex flex-1 flex-col gap-2">
              {hours[day].length === 0 ? (
                <span className="pt-2 text-sm text-muted-foreground">Pas de visite</span>
              ) : null}
              {hours[day].map((range, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    type="time"
                    step={900}
                    aria-label={`${WEEKDAY_LABELS[day]} début`}
                    className="w-32"
                    value={range.start}
                    disabled={pending}
                    onChange={(event) => update(day, index, "start", event.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">à</span>
                  <Input
                    type="time"
                    step={900}
                    aria-label={`${WEEKDAY_LABELS[day]} fin`}
                    className="w-32"
                    value={range.end}
                    disabled={pending}
                    onChange={(event) => update(day, index, "end", event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Retirer la plage"
                    disabled={pending}
                    onClick={() => removeRange(day, index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            {hours[day].length < 4 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                disabled={pending}
                onClick={() => addRange(day)}
              >
                <Plus className="size-4" />
                Plage
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <Button type="button" disabled={pending} onClick={handleSave}>
        {pending ? "Enregistrement…" : "Enregistrer les plages"}
      </Button>
    </div>
  );
}
