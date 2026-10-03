import type { PlatformWorkItem } from "@/lib/work-library/platform-catalog-types";

/** Minuscules sans accents : « Béton » trouve « beton ». Utilisable côté client. */
export function foldSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Tous les mots cherchés doivent apparaître (titre, référence, descriptif ou famille). */
export function matchesPlatformItem(item: PlatformWorkItem, terms: string[]): boolean {
  const haystack = foldSearchText(`${item.title} ${item.reference} ${item.description} ${item.workCategory}`);
  return terms.every((t) => haystack.includes(t));
}
