/**
 * Compatibilité de déploiement : reconnaît précisément l'erreur « objet de schéma absent »
 * (colonne, table ou fonction pas encore migrée) pour un objet donné, sans masquer les
 * autres erreurs (droits, réseau, contrainte…).
 *
 * Codes : 42703 colonne inconnue (Postgres, aussi renvoyé par PostgREST en lecture),
 * 42P01 table inconnue, 42883 fonction inconnue, PGRST202 fonction absente du cache
 * PostgREST, PGRST204 colonne absente du cache (écriture), PGRST205 table absente du cache.
 */
const MISSING_SCHEMA_CODES = new Set(["42703", "42P01", "42883", "PGRST202", "PGRST204", "PGRST205"]);

export function isMissingSchemaObject(
  error: { code?: string | null; message?: string | null } | null | undefined,
  objectName: string,
): boolean {
  if (!error?.code || !MISSING_SCHEMA_CODES.has(error.code)) return false;
  return (error.message ?? "").includes(objectName);
}
