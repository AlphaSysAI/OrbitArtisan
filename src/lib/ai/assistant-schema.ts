import { z } from "zod";

function coerceString(v: unknown): string {
  return String(v ?? "").trim();
}

function coerceNullableString(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v).trim() || null;
}

export const AssistantIntentSchema = z.object({
  intent: z.enum([
    "create_quote_draft",
    "create_appointment_draft",
    "navigate",
    "clarify",
    "help",
    "answer",
  ]),
  reply: z.preprocess(coerceString, z.string()),
  customer_query: z.preprocess(coerceNullableString, z.string().nullable()),
  navigate_path: z.preprocess(coerceNullableString, z.string().nullable()),
  /** Recopie littérale des mots de date du message, jamais une date inventée. */
  date_query: z.preprocess(coerceNullableString, z.string().nullable()),
  /** Heure citée : "11h", "14h30", "midi" */
  time_query: z.preprocess(coerceNullableString, z.string().nullable()),
  work_description: z.preprocess(coerceNullableString, z.string().nullable()),
  /** Sous-type pour intent=answer */
  answer_topic: z.preprocess(coerceNullableString, z.string().nullable()),
});

export type AssistantIntent = z.infer<typeof AssistantIntentSchema>;

export const ASSISTANT_INTENT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [
        "create_quote_draft",
        "create_appointment_draft",
        "navigate",
        "clarify",
        "help",
        "answer",
      ],
    },
    reply: {
      type: "string",
      description:
        "Pour navigate/help/clarify : 1 phrase. Pour answer : laisse une phrase courte, le serveur complètera avec la BDD.",
    },
    customer_query: {
      type: ["string", "null"],
      description: "Nom du client extrait (devis ou RDV), sans civilité.",
    },
    navigate_path: {
      type: ["string", "null"],
      description:
        "Chemin si navigate: /app, /app/rdv, /app/contacts, /app/messages, /app/quotes, /app/quotes/new, /app/invoices, /app/reglages",
    },
    date_query: {
      type: ["string", "null"],
      description:
        "Recopie mot pour mot les termes de date du message de l'artisan. Null si le message n'en contient aucun. N'invente jamais de date, ne complète pas depuis un exemple.",
    },
    time_query: {
      type: ["string", "null"],
      description: "Heure mentionnée (ex. « 11h », « 14h30 », « midi »). Null sinon.",
    },
    work_description: {
      type: ["string", "null"],
      description: "Résumé du chantier à chiffrer (create_quote_draft uniquement).",
    },
    answer_topic: {
      type: ["string", "null"],
      description: "Si intent=answer : appointments | pending_quotes | pending_invoices",
    },
  },
  required: [
    "intent",
    "reply",
    "customer_query",
    "navigate_path",
    "date_query",
    "time_query",
    "work_description",
    "answer_topic",
  ],
};

export type AssistantActionOpenQuote = {
  type: "open_quote_form";
  draftKey: string;
  href: string;
  preview: {
    customerName: string | null;
    customerMatched: boolean;
    serviceTitles: string[];
    materialsCount: number;
    laborHours: number | null;
    notes: string;
    warnings: string[];
  };
  draft: import("@/lib/ai/quote-draft-storage").AiQuoteDraft;
};

export type AssistantActionNavigate = {
  type: "navigate";
  href: string;
  label: string;
  /** Le client doit ouvrir automatiquement (pas de 2e confirmation). */
  auto: boolean;
};

export type AssistantActionOpenAppointment = {
  type: "open_appointment_form";
  href: string;
  preview: {
    customerName: string | null;
    customerMatched: boolean;
    /** ISO local YYYY-MM-DD */
    dateIso: string | null;
    /** HH:MM */
    time: string | null;
    warnings: string[];
  };
};

export type AssistantActionAnswer = {
  type: "answer";
  /** Lien optionnel pour approfondir (sans auto-open). */
  href?: string;
  label?: string;
};

export type AssistantApiResponse = {
  reply: string;
  intent: AssistantIntent["intent"];
  action?:
    | AssistantActionOpenQuote
    | AssistantActionOpenAppointment
    | AssistantActionNavigate
    | AssistantActionAnswer;
  suggestions?: string[];
};
