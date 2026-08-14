/** Correspondance floue « monsieur Untel » ↔ contacts artisan. */

export type ContactCandidate = {
  customerUserId: string;
  label: string;
  email: string | null;
  conversationId: string | null;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\b(m\.|mme|mr|monsieur|madame|mlle)\b/g, " ")
    .replace(/[^a-z0-9@.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter((t) => t.length >= 2);
}

/**
 * Score 0–1. Retourne le meilleur contact si score ≥ 0.45.
 */
export function matchContactByQuery(
  query: string,
  contacts: ContactCandidate[],
): { contact: ContactCandidate; score: number } | null {
  const q = normalize(query);
  if (!q || !contacts.length) return null;

  const qTokens = tokens(query);
  let best: { contact: ContactCandidate; score: number } | null = null;

  for (const contact of contacts) {
    const label = normalize(contact.label);
    const email = normalize(contact.email ?? "");
    let score = 0;

    if (label && (label === q || label.includes(q) || q.includes(label))) {
      score = Math.max(score, label === q ? 1 : 0.85);
    }
    if (email && (email === q || email.includes(q) || q.includes(email))) {
      score = Math.max(score, 0.9);
    }

    if (qTokens.length) {
      const labelTokens = new Set(tokens(contact.label));
      const hit = qTokens.filter((t) => labelTokens.has(t) || [...labelTokens].some((lt) => lt.includes(t) || t.includes(lt)));
      const overlap = hit.length / qTokens.length;
      score = Math.max(score, overlap * 0.95);
    }

    if (!best || score > best.score) best = { contact, score };
  }

  if (!best || best.score < 0.45) return null;
  return best;
}
