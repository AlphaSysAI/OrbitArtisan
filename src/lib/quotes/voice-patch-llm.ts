import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { MISTRAL_EXTRACTION_MODEL, mistralChatParse } from "@/lib/ai/mistral";
import type { AiQuoteDraft } from "@/lib/ai/quote-draft-storage";
import { ilikeOrPattern } from "@/lib/security/postgrest-filter";

import { draftLineRefs, QUOTE_PATCH_JSON_SCHEMA, QUOTE_PATCH_SYSTEM_PROMPT, quotePatchSchema, type QuotePatch } from "./voice-patch";

/** Consigne dictée → opérations (JSON strict, température 0). */
export async function llmQuotePatch(
  draft: AiQuoteDraft,
  instruction: string,
  labor: { hours: number; totalEur: number | null },
): Promise<QuotePatch> {
  const lines = draftLineRefs(draft)
    .map((l) => `${l.ref} | ${l.label} | qté ${l.quantity} | ${l.unitPriceEur} € HT`)
    .join("\n");
  const context = `DEVIS ACTUEL
Main-d'œuvre : ${labor.hours} h${labor.totalEur !== null ? `, ${labor.totalEur} € HT` : ""}
Fournitures :
${lines || "(aucune)"}

CONSIGNE DICTÉE :
« ${instruction.slice(0, 1500)} »`;

  return mistralChatParse(
    quotePatchSchema,
    [
      { role: "system", content: QUOTE_PATCH_SYSTEM_PROMPT },
      { role: "user", content: context },
    ],
    "quote_patch",
    {
      jsonSchema: QUOTE_PATCH_JSON_SCHEMA as unknown as Record<string, unknown>,
      strictSchema: true,
      model: MISTRAL_EXTRACTION_MODEL,
      temperature: 0,
      maxTokens: 1500,
    },
  );
}

/**
 * Fourniture ajoutée sans prix dicté : reprend le prix de la bibliothèque d'ouvrages
 * de l'artisan si UNE seule entrée correspond (jamais de prix « probable » inventé).
 */
export async function fillPricesFromLibrary(supabase: SupabaseClient, userId: string, patch: QuotePatch): Promise<string[]> {
  const notes: string[] = [];
  for (const op of patch.operations) {
    if (op.op !== "add_material" || op.unit_price_eur !== null || !op.label) continue;
    const { data } = await supabase
      .from("work_items")
      .select("title, unit_price_ht")
      .eq("user_id", userId)
      .ilike("title", ilikeOrPattern(op.label))
      .limit(2);
    if (data?.length === 1 && Number(data[0]!.unit_price_ht) > 0) {
      op.unit_price_eur = Number(data[0]!.unit_price_ht);
      notes.push(`« ${op.label} » : prix repris de ta bibliothèque (${data[0]!.title}).`);
    }
  }
  return notes;
}
