/** Créneaux de la vitrine : exclusion des horaires déjà occupés (client et serveur). */

export type BusyInterval = { start: string; end: string };

/** Vrai si [start, start + durée[ chevauche un RDV existant. */
export function overlapsBusy(startIso: string, durationMinutes: number, busy: BusyInterval[]): boolean {
  const start = new Date(startIso).getTime();
  const end = start + durationMinutes * 60_000;
  return busy.some((b) => start < new Date(b.end).getTime() && end > new Date(b.start).getTime());
}

export function filterFreeSlots(slotsIso: string[], durationMinutes: number, busy: BusyInterval[]): string[] {
  if (!busy.length) return slotsIso;
  return slotsIso.filter((iso) => !overlapsBusy(iso, durationMinutes, busy));
}
