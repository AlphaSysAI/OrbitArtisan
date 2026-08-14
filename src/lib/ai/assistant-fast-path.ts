/** Détection déterministe navigation / questions données (sans LLM). */

import { extractFrenchDates } from "@/lib/ai/extract-dates";
import { formatIsoDateFr, resolveFrenchDateQuery } from "@/lib/ai/resolve-date";

export type FastNavigateResult = {
  href: string;
  label: string;
  reply: string;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CONFIRM_RE =
  /^(ok|oui|ouais|go|vas[- ]?y|allez[- ]?y|c est bon|parfait|d accord|dac|ye[sp]|let s go|monte|ouvre)$/i;

export function isConfirmationMessage(message: string): boolean {
  return CONFIRM_RE.test(message.trim());
}

/** Question / demande d’info (répondre depuis la BDD, pas seulement naviguer). */
export function looksLikeDataQuestion(message: string): boolean {
  const m = normalize(message);
  if (/\?\s*$/.test(message.trim())) return true;
  return (
    /\b(ai[- ]?je|est[- ]?ce que|combien|quels?|quelles?|y a t il|y a[- ]?t[- ]?il|j ai|jai|aurai[- ]?je|dis[- ]?moi|sachant|savoir|reste[- ]?t[- ]?il|as[- ]?tu)\b/.test(
      m,
    ) || /\b(des|un|une|mes)\s+(rdv|rendez|devis|facture)/.test(m) && /\b(le|les|du|de|demain|aujourd)\b/.test(m)
  );
}

/**
 * Intention de CRÉER un rendez-vous (« crée un RDV pour Dupont le 13 août à 11h »).
 * À distinguer d’une question (« ai-je des RDV le 13 août ? ») et d’une navigation.
 */
export function looksLikeAppointmentCreation(message: string): boolean {
  const m = normalize(message);
  const aboutRdv = /\b(rdv|rendez[- ]?vous|intervention|visite|chantier)\b/.test(m);
  if (!aboutRdv) return false;

  const createVerb =
    /\b(cree|creer|cre|ajoute|ajouter|planifie|planifier|programme|programmer|organise|organiser|note|noter|enregistre|enregistrer|cale|caler|bloque|bloquer|prends|prendre|fixe|fixer|inscris|inscrire|met|mets|mettre|reserve|reserver|positionne|positionner)\b/.test(
      m,
    );
  if (!createVerb) return false;

  // « crée-moi la liste de mes RDV » n’est pas une création.
  return !/\b(liste|recap|recapitulatif|resume)\b/.test(m);
}

/** Vraie interrogation (« ai-je… ? »), par opposition à « ouvre mes RDV de demain ». */
function isExplicitQuestion(message: string): boolean {
  if (/\?\s*$/.test(message.trim())) return true;
  return /\b(ai[- ]?je|est[- ]?ce que|combien|y a[- ]?t[- ]?il|as[- ]?tu|aurai[- ]?je|dis[- ]?moi|suis[- ]?je)\b/.test(
    normalize(message),
  );
}

/** Intention d’ouvrir une page (navigation). */
export function looksLikeOpenCommand(message: string): boolean {
  const m = normalize(message);
  return /\b(ouvre|ouvrir|va(?:s)?\s+sur|aller\s+(a|à|sur)|emmene|redirige|affiche\s+la\s+page)\b/.test(m);
}

type PendingNav = { href: string; label: string };

export function tryConfirmNavigate(
  message: string,
  pending: PendingNav | null | undefined,
): FastNavigateResult | null {
  if (!pending?.href || !isConfirmationMessage(message)) return null;
  return {
    href: pending.href,
    label: pending.label,
    reply: `C’est parti — j’ouvre ${pending.label}.`,
  };
}

/**
 * Question RDV → à traiter via requête BDD (pas de navigation auto).
 * Retourne les dates à interroger, ou [] pour « mes prochains RDV » etc.
 */
export function tryRdvDataQuestion(message: string): { dates: string[]; kind: "dates" | "upcoming" | "pending" } | null {
  if (looksLikeAppointmentCreation(message)) return null;

  const m = normalize(message);
  const aboutRdv =
    /\b(rdv|rendez[- ]?vous|planning|agenda)\b/.test(m) ||
    /\b(suis[- ]?je|ai[- ]?je|avais[- ]?je).*(libre|occupe|dispo|rdv|rendez)\b/.test(m);

  if (!aboutRdv) return null;

  const dates = extractFrenchDates(message);

  // Dates citées + pas d’ordre « ouvre la page » → réponse BDD directe
  if (dates.length && !looksLikeOpenCommand(message)) {
    return { dates, kind: "dates" };
  }

  if (looksLikeOpenCommand(message) && !isExplicitQuestion(message)) return null;

  if (/\b(en attente|a valider|a confirmer|pending)\b/.test(m)) {
    return { dates: [], kind: "pending" };
  }

  if (looksLikeDataQuestion(message) || /\b(prochain|aujourd|demain|cette semaine)\b/.test(m)) {
    const single = resolveFrenchDateQuery(message);
    if (single) return { dates: [single], kind: "dates" };
    if (dates.length) return { dates, kind: "dates" };
    return { dates: [], kind: "upcoming" };
  }

  return null;
}

export function tryFastNavigate(message: string): FastNavigateResult | null {
  const m = normalize(message);
  if (!m || m.length > 140) return null;

  // Créer un RDV n’est ni une navigation, ni une lecture
  if (looksLikeAppointmentCreation(message)) return null;

  // Ne pas naviguer si c’est une question sur les données
  if (tryRdvDataQuestion(message)) return null;
  if (looksLikeDataQuestion(message) && !looksLikeOpenCommand(message)) return null;

  const dateIso = resolveFrenchDateQuery(message);
  const dates = extractFrenchDates(message);

  // RDV / planning — ouverture de page
  if (
    /\b(rdv|rendez[- ]?vous|planning|agenda|calendrier)\b/.test(m) ||
    /^(ouvre|montre|affiche|voir|va|aller)\b.*\b(rdv|rendez)/.test(m)
  ) {
    const focus = dates[0] ?? dateIso;
    const href = focus ? `/app/rdv?date=${focus}` : "/app/rdv";
    const when = focus
      ? dates.length > 1
        ? ` (${dates.map(formatIsoDateFr).join(", ")})`
        : ` du ${formatIsoDateFr(focus)}`
      : "";
    return {
      href,
      label: focus ? `RDV · ${formatIsoDateFr(focus)}` : "Mes RDV",
      reply: `J’ouvre tes rendez-vous${when}.`,
    };
  }

  if (/\b(facture|factures|encaissement|paiement|stripe)\b/.test(m)) {
    return { href: "/app/invoices", label: "Factures", reply: "J’ouvre tes factures." };
  }

  if (
    /\b(devis)\b/.test(m) &&
    /\b(liste|mes|voir|ouvre|montre|affiche)\b/.test(m) &&
    !/\b(cree|créer|nouveau|prepar)\b/.test(m)
  ) {
    return { href: "/app/quotes", label: "Devis", reply: "J’ouvre la liste de tes devis." };
  }

  if (/\b(message|messages|messagerie|boite)\b/.test(m)) {
    return { href: "/app/messages", label: "Messages", reply: "J’ouvre tes messages." };
  }

  if (/\b(contact|contacts|clients)\b/.test(m)) {
    return { href: "/app/contacts", label: "Contacts", reply: "J’ouvre tes contacts." };
  }

  if (/\b(reglage|reglages|parametre|parametres|profil|prestations)\b/.test(m)) {
    return { href: "/app/reglages", label: "Réglages", reply: "J’ouvre les réglages." };
  }

  if (/^(accueil|home|tableau de bord)$/.test(m)) {
    return { href: "/app", label: "Accueil", reply: "Retour à l’accueil." };
  }

  return null;
}

export function looksLikeQuoteRequest(message: string): boolean {
  const m = normalize(message);
  return (
    /\b(devis|chiffr|facture.*client|prepar.*devis|cree.*devis|créer.*devis)\b/.test(m) &&
    !/\b(liste|mes devis|voir mes devis|ouvre.*devis|montre.*devis)\b/.test(m)
  );
}
