/**
 * Normalisation des coordonnées extraites d'une transcription d'appel.
 * Module pur (testable) : l'appel à l'IA est dans extract-call-contact.ts.
 */
export type CallContact = { customerName: string | null; customerEmail: string | null };

const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const PLACEHOLDERS = new Set(["", "null", "inconnu", "non communiqué", "non renseigné", "n/a", "client", "appelant"]);

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCallContact(raw: unknown): CallContact {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const name = clean(obj.customer_name).replace(/\s+/g, " ");
  const customerName = PLACEHOLDERS.has(name.toLowerCase()) || name.length > 80 ? null : name;

  // Adresse dictée au téléphone : on retire espaces et on met en minuscules,
  // puis on n'accepte qu'un format d'e-mail valide (sinon l'artisan complète).
  const email = clean(obj.customer_email).toLowerCase().replace(/\s+/g, "");
  const customerEmail = EMAIL_PATTERN.test(email) ? email : null;

  return { customerName, customerEmail };
}
