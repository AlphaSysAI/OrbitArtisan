"use server";

import { revalidatePath } from "next/cache";

import { requireArtisanProfileId } from "@/lib/auth/require-artisan";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { sheetMatchesTrade } from "@/lib/technical-sheets/catalog";
import { loadSheetReviews } from "@/lib/technical-sheets/data";
import { generateTechnicalSheet } from "@/lib/technical-sheets/generate-sheet";
import { TECHNICAL_SHEET_LIBRARY } from "@/lib/technical-sheets/library";
import { smartSearchSheets, type SmartSearchMatch } from "@/lib/technical-sheets/smart-search";
import { formatTradeLabel } from "@/lib/trades/taxonomy";

export type GenerateSheetActionResult =
  | { ok: true; id: string }
  | { ok: false; error: "auth" | "invalid" | "rate_limited" | "refused" | "ai_failed" | "save_failed"; message: string };

const MESSAGES = {
  auth: "Session expirée : reconnecte-toi.",
  invalid: "Décris le travail en quelques mots (entre 5 et 300 caractères).",
  rate_limited: "Tu as atteint la limite de 10 fiches générées par jour. Réessaie demain.",
  ai_failed: "La génération n'a pas abouti. Réessaie dans un instant.",
  save_failed: "La fiche n'a pas pu être enregistrée. Réessaie dans un instant.",
} as const;

export async function generateTechnicalSheetAction(rawRequest: string): Promise<GenerateSheetActionResult> {
  const request = String(rawRequest ?? "").replace(/\s+/g, " ").trim();
  if (request.length < 5 || request.length > 300) return { ok: false, error: "invalid", message: MESSAGES.invalid };

  const auth = await requireArtisanProfileId(["trade_category", "trade"]);
  if (!auth.ok) return { ok: false, error: "auth", message: MESSAGES.auth };

  if (!(await consumeRateLimit(RATE_LIMITS.technicalSheetAi, `profile:${auth.profileId}`))) {
    return { ok: false, error: "rate_limited", message: MESSAGES.rate_limited };
  }

  const tradeCategoryId = (auth.profile.trade_category as string | null) ?? null;
  const tradeId = (auth.profile.trade as string | null) ?? null;
  const generated = await generateTechnicalSheet({ request, tradeLabel: formatTradeLabel(tradeCategoryId, tradeId) });
  if (!generated.ok) {
    if (generated.error === "refused") return { ok: false, error: "refused", message: generated.reason };
    return { ok: false, error: "ai_failed", message: MESSAGES.ai_failed };
  }

  const { data, error } = await auth.supabase
    .from("technical_sheets_ai")
    .insert({
      profile_id: auth.profileId,
      trade_category_id: tradeCategoryId,
      trade_id: tradeId,
      request,
      title: generated.sheet.title,
      content: generated.sheet,
      model: generated.model,
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[technical-sheets] save", error?.message);
    return { ok: false, error: "save_failed", message: MESSAGES.save_failed };
  }

  revalidatePath("/app/fiches");
  return { ok: true, id: data.id };
}

export async function deleteAiSheetAction(id: string): Promise<{ ok: boolean }> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false };
  const { error } = await auth.supabase
    .from("technical_sheets_ai")
    .delete()
    .eq("id", id)
    .eq("profile_id", auth.profileId);
  if (error) return { ok: false };
  revalidatePath("/app/fiches");
  return { ok: true };
}

export type SmartSearchActionResult = { ok: true; matches: SmartSearchMatch[] } | { ok: false; error: "auth" | "rate_limited" | "failed" };

/**
 * Recherche qui comprend la demande, limitée au métier affiché :
 * `familyId` = famille choisie via « Autres métiers », null = métier de l'artisan.
 */
export async function smartSearchSheetsAction(rawQuery: string, familyId: string | null): Promise<SmartSearchActionResult> {
  const query = String(rawQuery ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (query.length < 3) return { ok: true, matches: [] };

  const auth = await requireArtisanProfileId(["trade_category", "trade"]);
  if (!auth.ok) return { ok: false, error: "auth" };
  if (!(await consumeRateLimit(RATE_LIMITS.technicalSheetSearch, `profile:${auth.profileId}`))) {
    return { ok: false, error: "rate_limited" };
  }

  const reviews = await loadSheetReviews(auth.supabase);
  const tradeCategoryId = (auth.profile.trade_category as string | null) ?? null;
  const tradeId = (auth.profile.trade as string | null) ?? null;
  const scope = TECHNICAL_SHEET_LIBRARY.filter(
    (sheet) =>
      reviews.get(sheet.id)?.status !== "needs_changes" &&
      (familyId ? sheet.tradeCategoryId === familyId : sheetMatchesTrade(sheet, tradeCategoryId, tradeId)),
  );

  try {
    return { ok: true, matches: await smartSearchSheets(query, scope) };
  } catch (error) {
    console.error("[technical-sheets] smart search", error instanceof Error ? error.message : error);
    return { ok: false, error: "failed" };
  }
}
