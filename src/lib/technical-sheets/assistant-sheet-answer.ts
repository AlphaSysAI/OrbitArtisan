import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AssistantApiResponse } from "@/lib/ai/assistant-schema";
import {
  findSheetsForQuestion,
  looksLikeTechnicalSheetRequest,
  sheetQueryTopic,
} from "@/lib/technical-sheets/assistant-sheet-lookup";
import { loadSheetReviews } from "@/lib/technical-sheets/data";

const SUGGESTIONS = ["Fiche pour poser un tableau électrique", "Comment poser un WC suspendu ?", "Ouvre mes RDV de demain"];

/** Réponse de l'assistant à une demande de fiche technique (null : pas une demande de fiche). */
export async function answerTechnicalSheetRequest(
  supabase: SupabaseClient,
  message: string,
  profile: { trade_category?: string | null; trade?: string | null },
): Promise<AssistantApiResponse | null> {
  if (!looksLikeTechnicalSheetRequest(message)) return null;

  const reviews = await loadSheetReviews(supabase);
  const excludedIds = new Set([...reviews.values()].filter((r) => r.status === "needs_changes").map((r) => r.sheetId));
  const sheets = findSheetsForQuestion(message, {
    tradeCategoryId: profile.trade_category,
    tradeId: profile.trade,
    excludedIds,
  });
  const topic = sheetQueryTopic(message);

  if (sheets.length === 0) {
    const href = topic ? `/app/fiches?q=${encodeURIComponent(topic)}` : "/app/fiches";
    return {
      reply:
        "Je n'ai pas de fiche relue sur ce sujet dans la bibliothèque. Sur la page Fiches techniques, tu peux en faire rédiger une par l'IA : elle sera marquée « non vérifiée ».",
      intent: "answer",
      action: { type: "answer", href, label: "Demander la fiche à l'IA" },
      suggestions: SUGGESTIONS,
    };
  }

  const [best, ...others] = sheets;
  const status = (id: string) => (reviews.get(id)?.status === "verified" ? "vérifiée" : "en cours de relecture");
  const reply =
    others.length === 0
      ? `J'ai la fiche « ${best!.title} » (${status(best!.id)}).`
      : `La plus proche : « ${best!.title} » (${status(best!.id)}). Autres fiches : ${others.map((s) => `« ${s.title} »`).join(", ")}.`;

  return {
    reply,
    intent: "answer",
    action: { type: "answer", href: `/app/fiches/${best!.id}`, label: "Ouvrir la fiche" },
    suggestions: SUGGESTIONS,
  };
}
