import { z } from "zod";

/** Nombre maximum de questions posées avant de passer à la suite du tunnel. */
export const MAX_LEAD_CHAT_QUESTIONS = 4;

function coerceNullableString(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v).trim() || null;
}

function coerceBoolean(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.trim().toLowerCase() === "true";
  return false;
}

export const LeadChatTurnSchema = z.object({
  /** Prochaine question à poser, ou null si le besoin est assez clair. */
  question: z.preprocess(coerceNullableString, z.string().nullable()),
  done: z.preprocess(coerceBoolean, z.boolean()),
  /** Récapitulatif du besoin, réinjecté dans le champ description libre. */
  summary: z.preprocess((v) => String(v ?? "").trim(), z.string()),
});

export type LeadChatTurn = z.infer<typeof LeadChatTurnSchema>;

export const LEAD_CHAT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    question: {
      type: ["string", "null"],
      description: "Une seule question courte, concrète, en français. Null si done=true.",
    },
    done: {
      type: "boolean",
      description: "true dès que le besoin est suffisamment décrit pour un artisan.",
    },
    summary: {
      type: "string",
      description: "Résumé du besoin à la 1re personne, 1 à 3 phrases, prêt à être relu par le client.",
    },
  },
  required: ["question", "done", "summary"],
};

export type LeadChatMessage = { role: "assistant" | "user"; content: string };
