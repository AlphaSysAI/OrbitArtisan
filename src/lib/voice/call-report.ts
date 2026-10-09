import { z } from "zod";

import { normalizeCallContact } from "./call-contact";

/**
 * Compte rendu structuré d'un appel Soline (module pur, testable).
 *
 * Deux origines distinctes, jamais mélangées :
 * - `declared`, `urgency`, `missing`, `contradictions` : ce que l'APPELANT a dit,
 *   extrait de la transcription par le modèle (informations déclarées, non vérifiées) ;
 * - `actions`, `humanValidation` : établis par le CODE à partir des données en base
 *   (RDV réellement créé, brouillon de devis), jamais à partir de ce que dit le modèle.
 * Pas de score de confiance : on indique la source et ce qui reste à vérifier.
 */

export const CALL_INTENTS = [
  "nouvelle_demande",
  "depannage",
  "suivi_chantier",
  "devis_facture",
  "fournisseur",
  "demarchage",
  "autre",
  "inconnue",
] as const;
export type CallIntent = (typeof CALL_INTENTS)[number];

export const CALL_INTENT_LABELS: Record<CallIntent, string> = {
  nouvelle_demande: "Nouvelle demande de travaux",
  depannage: "Dépannage",
  suivi_chantier: "Suivi de chantier",
  devis_facture: "Question devis / facture",
  fournisseur: "Fournisseur",
  demarchage: "Démarchage",
  autre: "Autre demande",
  inconnue: "Motif non identifié",
};

/** danger potentiel ≠ intervention rapide ≠ échéance commerciale ≠ travaux planifiables. */
export const URGENCY_LEVELS = ["danger", "intervention_rapide", "echeance", "planifiable", "inconnue"] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

export const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  danger: "Danger potentiel signalé",
  intervention_rapide: "Intervention demandée rapidement",
  echeance: "Échéance à tenir",
  planifiable: "Travaux planifiables",
  inconnue: "Urgence non précisée",
};

export const WORK_REQUEST_LEVELS = ["explicite", "ambigu", "aucun"] as const;

const text = (max: number) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return null;
    const t = v.replace(/\s+/g, " ").trim();
    return t && !/^(null|inconnu|non communiqu[ée]|n\/a|-)$/i.test(t) ? t.slice(0, max) : null;
  }, z.string().nullable());

const textList = (maxItems: number, maxLen: number) =>
  z.preprocess(
    (v) =>
      Array.isArray(v)
        ? v
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.replace(/\s+/g, " ").trim().slice(0, maxLen))
            .filter(Boolean)
            .slice(0, maxItems)
        : [],
    z.array(z.string()),
  );

/** Sortie du modèle (validée) : uniquement des informations déclarées pendant l'appel. */
export const CallAnalysisSchema = z.object({
  intent: z.preprocess((v) => (CALL_INTENTS as readonly string[]).includes(String(v)) ? v : "inconnue", z.enum(CALL_INTENTS)),
  summary: text(600),
  caller: z
    .object({
      name: text(80),
      email: text(254),
      callback_phone: text(40),
    })
    .catch({ name: null, email: null, callback_phone: null }),
  declared: z
    .object({
      need: text(300),
      location: text(200),
      building: text(120),
      zone: text(120),
      dimensions: text(200),
      access: text(200),
      deadline: text(160),
      availability: text(200),
    })
    .catch({ need: null, location: null, building: null, zone: null, dimensions: null, access: null, deadline: null, availability: null }),
  urgency: z
    .object({
      level: z.preprocess((v) => (URGENCY_LEVELS as readonly string[]).includes(String(v)) ? v : "inconnue", z.enum(URGENCY_LEVELS)),
      facts: textList(4, 160),
    })
    .catch({ level: "inconnue", facts: [] }),
  /**
   * Demande de travaux à chiffrer, indépendamment de l'intention principale :
   * explicite (travaux nouveaux/supplémentaires ou modification de devis clairement demandés),
   * ambigu (évoqués sans demande claire), aucun. Valeur inconnue → « aucun ».
   */
  work_request: z.preprocess(
    (v) => ((WORK_REQUEST_LEVELS as readonly string[]).includes(String(v)) ? v : "aucun"),
    z.enum(WORK_REQUEST_LEVELS),
  ),
  missing: textList(6, 120),
  contradictions: textList(4, 200),
  next_step: text(240),
});
export type CallAnalysis = z.infer<typeof CallAnalysisSchema>;

export type CallReportAction = {
  type: "rendez_vous" | "brouillon_devis";
  /** Statut lu en base au moment du compte rendu. */
  status: "en_attente_validation" | "confirme" | "annule" | "brouillon_a_valider";
  label: string;
  reference?: string;
};

export type CallReport = {
  version: 1;
  analysis: CallAnalysis | null;
  /** Analyse indisponible (erreur modèle) : l'appel est enregistré, à lire dans la transcription. */
  analysisError?: string;
  actions: CallReportAction[];
  humanValidation: string[];
  meta: {
    agentPromptVersion: string | null;
    conversationId: string | null;
    callDurationSecs: number | null;
    analysisModel: string | null;
    analyzedAt: string;
  };
};

/** Valide la sortie brute du modèle ; null si inexploitable. */
export function parseCallAnalysis(raw: unknown): CallAnalysis | null {
  const result = CallAnalysisSchema.safeParse(raw);
  if (!result.success) return null;
  const a = result.data;
  // Nom et e-mail : mêmes règles que la saisie (valeurs de remplissage rejetées, e-mail valide).
  const contact = normalizeCallContact({ customer_name: a.caller.name, customer_email: a.caller.email });
  return { ...a, caller: { ...a.caller, name: contact.customerName, email: contact.customerEmail } };
}

/**
 * Brouillon de devis automatique ?
 * - draft    : demande de travaux explicite (y compris dans un suivi de chantier ou une
 *              question sur un devis) ;
 * - validate : besoin ambigu, incohérent (nouvelle demande sans travaux identifiés) ou analyse
 *              indisponible → besoin conservé dans le compte rendu, l'artisan décide ;
 * - none     : démarchage, fournisseur, ou aucun besoin de travaux.
 */
export type QuoteDraftDecision = "draft" | "validate" | "none";

const NEVER_QUOTE_INTENTS = new Set<CallIntent>(["demarchage", "fournisseur"]);
const WORK_INTENTS = new Set<CallIntent>(["nouvelle_demande", "depannage"]);

export function quoteDraftDecision(a: CallAnalysis | null): QuoteDraftDecision {
  if (!a) return "validate";
  if (NEVER_QUOTE_INTENTS.has(a.intent)) return "none";
  if (a.work_request === "explicite") return "draft";
  if (a.work_request === "ambigu") return "validate";
  return WORK_INTENTS.has(a.intent) ? "validate" : "none";
}

/** Appel à signaler en tête de liste : danger potentiel ou intervention demandée rapidement. */
export function isUrgentAnalysis(a: CallAnalysis | null): boolean {
  return a?.urgency.level === "danger" || a?.urgency.level === "intervention_rapide";
}

export function urgencyReason(a: CallAnalysis | null): string | null {
  if (!isUrgentAnalysis(a)) return null;
  const facts = a!.urgency.facts.join(" ; ");
  return `${URGENCY_LABELS[a!.urgency.level]}${facts ? ` : ${facts}` : ""}`.slice(0, 160);
}

/** Validations humaines requises, déduites des actions réelles (et non du discours du modèle). */
export function requiredHumanValidations(
  actions: CallReportAction[],
  a: CallAnalysis | null,
  quoteDecision: QuoteDraftDecision = "none",
): string[] {
  const out: string[] = [];
  const hasDraft = actions.some((x) => x.type === "brouillon_devis");
  if (quoteDecision === "validate" && !hasDraft) {
    out.push(
      a
        ? `Besoin de travaux à confirmer avec le client avant tout devis${a.declared.need ? ` : « ${a.declared.need} »` : ""}.`
        : "Compte rendu indisponible : lire la transcription et décider s'il faut un devis.",
    );
  }
  for (const action of actions) {
    if (action.type === "rendez_vous" && action.status === "en_attente_validation") {
      out.push(`Confirmer ou refuser le rendez-vous ${action.label} (le client attend un SMS).`);
    }
    if (action.type === "brouillon_devis" && action.status === "brouillon_a_valider") {
      out.push("Relire le brouillon de devis avant tout envoi.");
    }
  }
  if (a?.contradictions.length) out.push("Lever les informations contradictoires avant de répondre au client.");
  if (!actions.some((x) => x.type === "rendez_vous" && x.status !== "annule") && a && a.intent !== "demarchage") {
    out.push("Rappeler le client.");
  }
  return out;
}

/** Texte court affiché dans la liste des appels (le résumé du modèle, sinon un repli factuel). */
export function reportSummaryText(a: CallAnalysis | null, fallback: string): string {
  if (!a) return fallback;
  const parts = [a.summary ?? a.declared.need ?? CALL_INTENT_LABELS[a.intent]];
  return parts.filter(Boolean).join(" ").slice(0, 600) || fallback;
}

const ACTION_STATUSES = new Set<CallReportAction["status"]>(["en_attente_validation", "confirme", "annule", "brouillon_a_valider"]);

/**
 * Lecture défensive d'un compte rendu stocké : anciens appels (null), versions antérieures
 * (champs ajoutés depuis → valeurs par défaut), formes partielles (ignorées, jamais d'exception).
 */
export function readCallReport(raw: unknown): CallReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<CallReport>;
  if (r.version !== 1 || !Array.isArray(r.actions)) return null;
  return {
    ...(r as CallReport),
    analysis: r.analysis == null ? null : parseCallAnalysis(r.analysis),
    actions: r.actions.filter(
      (a): a is CallReportAction =>
        Boolean(a) && typeof a === "object" && typeof a.label === "string" && ACTION_STATUSES.has(a.status),
    ),
    humanValidation: Array.isArray(r.humanValidation) ? r.humanValidation.filter((v) => typeof v === "string") : [],
  };
}
