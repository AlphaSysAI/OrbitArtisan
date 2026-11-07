import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AssistantApiResponse } from "@/lib/ai/assistant-schema";
import {
  findSheetsForQuestion,
  looksLikeTechnicalSheetRequest,
  looksLikeWorksiteSituation,
  sheetQueryTopic,
} from "@/lib/technical-sheets/assistant-sheet-lookup";
import { getLibrarySheet, sheetMatchesTrade, sheetTradesLabel } from "@/lib/technical-sheets/catalog";
import { loadSheetReviews } from "@/lib/technical-sheets/data";
import { TECHNICAL_SHEET_LIBRARY } from "@/lib/technical-sheets/library";
import { smartSearchSheets, type SmartSearchMatch } from "@/lib/technical-sheets/smart-search";

const SUGGESTIONS = ["Fiche pour poser un tableau électrique", "Comment poser un WC suspendu ?", "Ouvre mes RDV de demain"];

type Profile = { trade_category?: string | null; trade?: string | null };

/**
 * Fiches proposées : l'IA comprend la demande (toute la bibliothèque), les fiches du
 * métier de l'artisan d'abord. Repli sur la recherche par mots si l'IA ne répond pas.
 */
async function findSheets(message: string, profile: Profile, excludedIds: Set<string>): Promise<SmartSearchMatch[]> {
  const available = TECHNICAL_SHEET_LIBRARY.filter((sheet) => !excludedIds.has(sheet.id));
  try {
    const matches = await smartSearchSheets(message, available);
    const isMine = (m: SmartSearchMatch) => {
      const sheet = getLibrarySheet(m.id);
      return !!sheet && sheetMatchesTrade(sheet, profile.trade_category, profile.trade);
    };
    return [...matches.filter(isMine), ...matches.filter((m) => !isMine(m))].slice(0, 3);
  } catch (error) {
    console.error("[technical-sheets] assistant smart search", error instanceof Error ? error.message : error);
    return findSheetsForQuestion(message, { tradeCategoryId: profile.trade_category, tradeId: profile.trade, excludedIds }).map(
      (sheet) => ({ id: sheet.id, reason: "" }),
    );
  }
}

/**
 * Réponse de l'assistant à une demande de fiche technique.
 * null : pas une demande de fiche, ou situation de chantier sans fiche qui corresponde
 * (l'assistant poursuit alors son traitement habituel).
 */
export async function answerTechnicalSheetRequest(
  supabase: SupabaseClient,
  message: string,
  profile: Profile,
): Promise<AssistantApiResponse | null> {
  const explicit = looksLikeTechnicalSheetRequest(message);
  if (!explicit && !looksLikeWorksiteSituation(message)) return null;

  const reviews = await loadSheetReviews(supabase);
  const excludedIds = new Set([...reviews.values()].filter((r) => r.status === "needs_changes").map((r) => r.sheetId));
  const matches = await findSheets(message, profile, excludedIds);

  if (matches.length === 0) {
    if (!explicit) return null;
    const topic = sheetQueryTopic(message);
    const href = topic ? `/app/fiches?q=${encodeURIComponent(topic)}` : "/app/fiches";
    return {
      reply:
        "Je n'ai pas de fiche relue sur ce sujet dans la bibliothèque. Sur la page Fiches techniques, tu peux en faire rédiger une par l'IA : elle sera marquée « non vérifiée ».",
      intent: "answer",
      action: { type: "answer", href, label: "Demander la fiche à l'IA" },
      suggestions: SUGGESTIONS,
    };
  }

  const lines = matches.flatMap((m) => {
    const sheet = getLibrarySheet(m.id);
    if (!sheet) return [];
    const status = reviews.get(sheet.id)?.status === "verified" ? "vérifiée" : "en relecture";
    const otherTrade = sheetMatchesTrade(sheet, profile.trade_category, profile.trade) ? "" : ` · ${sheetTradesLabel(sheet)}`;
    return [`• ${sheet.title}${m.reason ? ` — ${m.reason}` : ""} (${status}${otherTrade})`];
  });
  const intro = matches.length === 1 ? "Cette fiche peut t'aider :" : "Ces fiches peuvent t'aider :";

  return {
    reply: `${intro}\n${lines.join("\n")}`,
    intent: "answer",
    action: { type: "answer", href: `/app/fiches/${matches[0]!.id}`, label: "Ouvrir la fiche" },
    suggestions: SUGGESTIONS,
  };
}
