/**
 * Lignes de main-d'œuvre proposées par l'IA (une par phase de chantier).
 * Pur et partagé : formulaire (client) et création directe du devis (serveur)
 * produisent les mêmes lignes à partir du même brouillon.
 */
export type AiLaborItem = { title: string; minutes: number };

const MAX_TITLE = 300;

/** labor_items Mistral (quantity = heures) → lignes exploitables ; ignore les lignes vides ou à 0 h. */
export function laborItemsFromAi(items: { description: string; quantity: number }[]): AiLaborItem[] {
  return items
    .map((i) => ({
      title: String(i.description ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_TITLE),
      minutes: Math.round(Number(i.quantity) * 60),
    }))
    .filter((i) => i.title && Number.isFinite(i.minutes) && i.minutes > 0);
}

/**
 * Ramène les phases à une durée totale (ex. après une correction « compte 120 h ») en
 * conservant leurs proportions. Arrondi au quart d'heure ; l'écart d'arrondi va sur la
 * dernière phase pour que la somme égale exactement le total (montant MO inchangé).
 */
export function scaleLaborItems(items: AiLaborItem[], totalMinutes: number): AiLaborItem[] {
  const sum = items.reduce((acc, i) => acc + i.minutes, 0);
  if (!items.length || sum <= 0 || !(totalMinutes > 0)) return items;
  if (sum === totalMinutes) return items;
  let allocated = 0;
  return items.map((item, idx) => {
    if (idx === items.length - 1) return { ...item, minutes: Math.max(totalMinutes - allocated, 0) };
    const minutes = Math.round(((item.minutes / sum) * totalMinutes) / 15) * 15;
    allocated += minutes;
    return { ...item, minutes };
  });
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Prestation du catalogue au libellé identique (casse / accents près) ; sinon null → libellé IA conservé. */
export function exactCatalogService<T extends { id: string; title: string }>(catalog: T[], title: string): T | null {
  const key = fold(title);
  return catalog.find((s) => fold(s.title) === key) ?? null;
}
