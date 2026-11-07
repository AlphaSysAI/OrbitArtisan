import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseStoredSheetContent } from "@/lib/technical-sheets/sheet-schema";
import type { SheetReview, SheetReviewStatus, TechnicalSheetContent } from "@/lib/technical-sheets/types";

type ReviewRow = {
  sheet_id: string;
  status: SheetReviewStatus;
  reviewer_name: string | null;
  note: string | null;
  reviewed_at: string;
};

/** Relectures par fiche (vide si la migration 76 n'est pas encore appliquée). */
export async function loadSheetReviews(supabase: SupabaseClient): Promise<Map<string, SheetReview>> {
  const { data, error } = await supabase
    .from("technical_sheet_reviews")
    .select("sheet_id, status, reviewer_name, note, reviewed_at");
  if (error) {
    console.error("[technical-sheets] reviews", error.message);
    return new Map();
  }
  return new Map(
    ((data ?? []) as ReviewRow[]).map((row) => [
      row.sheet_id,
      {
        sheetId: row.sheet_id,
        status: row.status,
        reviewerName: row.reviewer_name,
        note: row.note,
        reviewedAt: row.reviewed_at,
      },
    ]),
  );
}

export type AiSheetSummary = { id: string; title: string; request: string; createdAt: string };

export async function listAccountAiSheets(supabase: SupabaseClient, profileId: string): Promise<AiSheetSummary[]> {
  const { data, error } = await supabase
    .from("technical_sheets_ai")
    .select("id, title, request, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[technical-sheets] ai list", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({ id: row.id, title: row.title, request: row.request, createdAt: row.created_at }));
}

export type AiSheet = AiSheetSummary & { content: TechnicalSheetContent };

/** Fiche IA du compte (null si introuvable, d'un autre compte ou illisible). */
export async function getAccountAiSheet(supabase: SupabaseClient, profileId: string, id: string): Promise<AiSheet | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase
    .from("technical_sheets_ai")
    .select("id, title, request, created_at, content")
    .eq("id", id)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!data) return null;
  const content = parseStoredSheetContent(data.content);
  if (!content) return null;
  return { id: data.id, title: data.title, request: data.request, createdAt: data.created_at, content };
}
