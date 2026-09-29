/**
 * Motif ILIKE sûr pour une chaîne interpolée dans un filtre PostgREST `.or()`.
 * Retire les jokers SQL (% _) et les caractères de syntaxe PostgREST
 * (, . ( ) " \ :) qui permettraient d'ajouter des conditions au filtre.
 */
export function ilikeOrPattern(input: string): string {
  const cleaned = input
    .replace(/[%_,.()"\\:*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return `%${cleaned}%`;
}
