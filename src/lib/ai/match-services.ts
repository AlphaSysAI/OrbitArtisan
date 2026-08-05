/** Correspondance simple titres IA ↔ catalogue prestations artisan. */

export function matchServiceIdsByTitles(
  catalog: { id: string; title: string }[],
  titlesFromAi: string[],
  laborDescriptions: string[],
): string[] {
  const needles = [...titlesFromAi, ...laborDescriptions]
    .map((t) => normalize(t))
    .filter(Boolean);

  const matched = new Set<string>();

  for (const service of catalog) {
    const hay = normalize(service.title);
    if (!hay) continue;
    for (const needle of needles) {
      if (hay === needle || hay.includes(needle) || needle.includes(hay)) {
        matched.add(service.id);
        break;
      }
    }
  }

  return [...matched];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

export function laborMinutesFromItems(items: { quantity: number }[]): number {
  const totalHours = items.reduce((acc, item) => {
    const q = Number(item.quantity);
    return acc + (Number.isFinite(q) && q > 0 ? q : 0);
  }, 0);
  if (totalHours <= 0) return 0;
  return Math.min(Math.round(totalHours * 60), 1_000_000);
}
