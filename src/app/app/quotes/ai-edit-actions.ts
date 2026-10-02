"use server";

import { z } from "zod";

import { MISTRAL_EXTRACTION_MODEL, mistralChat, parseJsonFromLlm } from "@/lib/ai/mistral";
import { estimateMaterialUnitPricesEur, lookupEstimatedUnitPrice } from "@/lib/ai/quote-material-unit-pricing";
import { requireArtisanProfileId } from "@/lib/auth/require-artisan";
import {
  describeSnapshot,
  FORM_PATCH_JSON_SCHEMA,
  FORM_PATCH_SYSTEM_PROMPT,
  formPatchSchema,
  type FormPatch,
  type QuoteFormSnapshot,
} from "@/lib/quotes/form-patch";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { ilikeOrPattern } from "@/lib/security/postgrest-filter";

const snapshotSchema = z.object({
  lines: z
    .array(
      z.object({
        id: z.string().max(80),
        source: z.enum(["manual", "supplier"]),
        label: z.string().max(300),
        quantity: z.number().finite(),
        unitPriceEur: z.number().finite().nullable(),
      }),
    )
    .max(200),
  labor: z.array(z.object({ id: z.string().max(80), title: z.string().max(300), hours: z.number().finite() })).max(50),
  laborRateEur: z.number().finite().nullable(),
  notes: z.string().max(5000),
});

export type AiEditResult =
  | { ok: true; patch: FormPatch; pricingNotes: string[] }
  | { ok: false; error: "auth" | "invalid" | "rate_limited" | "ai_failed" };

async function llmFormPatch(snapshot: QuoteFormSnapshot, instruction: string): Promise<FormPatch> {
  const messages = [
    { role: "system" as const, content: FORM_PATCH_SYSTEM_PROMPT },
    { role: "user" as const, content: `DEVIS ACTUEL\n${describeSnapshot(snapshot)}\n\nCONSIGNE :\n« ${instruction} »` },
  ];
  const formats = [
    { type: "json_schema" as const, name: "quote_form_patch", schema: FORM_PATCH_JSON_SCHEMA as unknown as Record<string, unknown>, strict: true },
    "json_object" as const,
  ];
  let last: unknown = null;
  for (const responseFormat of formats) {
    try {
      const raw = await mistralChat({
        model: MISTRAL_EXTRACTION_MODEL,
        messages:
          responseFormat === "json_object"
            ? [...messages, { role: "system", content: `JSON conforme à : ${JSON.stringify(FORM_PATCH_JSON_SCHEMA)}` }]
            : messages,
        temperature: 0,
        maxTokens: 2000,
        responseFormat,
      });
      const parsed = formPatchSchema.safeParse(parseJsonFromLlm(raw));
      if (parsed.success) return parsed.data;
      last = parsed.error;
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("patch_failed");
}

/**
 * Consigne « modifie le devis » → opérations ciblées, appliquées côté formulaire.
 * Seules les fournitures AJOUTÉES sans prix sont chiffrées : bibliothèque de
 * l'artisan d'abord, puis prix publics web (Tavily) pour celles-là uniquement.
 * Les lignes existantes ne déclenchent aucune nouvelle recherche.
 */
export async function aiEditQuoteForm(input: { snapshot: QuoteFormSnapshot; instruction: string }): Promise<AiEditResult> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: "auth" };

  const instruction = String(input.instruction ?? "").trim().slice(0, 1500);
  const snapshot = snapshotSchema.safeParse(input.snapshot);
  if (instruction.length < 3 || !snapshot.success) return { ok: false, error: "invalid" };

  if (!(await consumeRateLimit({ bucket: "quote_ai_edit", max: 120, windowSeconds: 3600 }, auth.profileId))) {
    return { ok: false, error: "rate_limited" };
  }

  let patch: FormPatch;
  try {
    patch = await llmFormPatch(snapshot.data, instruction);
  } catch (error) {
    console.error("[quote ai edit]", error instanceof Error ? error.message : error);
    return { ok: false, error: "ai_failed" };
  }

  const pricingNotes: string[] = [];
  const unpriced = patch.operations.filter((op) => op.op === "add_line" && op.unit_price_eur === null && op.label?.trim());

  // 1. Bibliothèque d'ouvrages : une seule correspondance → son prix.
  for (const op of unpriced) {
    const { data } = await auth.supabase
      .from("work_items")
      .select("title, unit_price_ht")
      .eq("user_id", auth.userId)
      .ilike("title", ilikeOrPattern(op.label!.trim()))
      .limit(2);
    if (data?.length === 1 && Number(data[0]!.unit_price_ht) > 0) {
      op.unit_price_eur = Number(data[0]!.unit_price_ht);
      pricingNotes.push(`« ${op.label} » : prix de ta bibliothèque (${data[0]!.title}).`);
    }
  }

  // 2. Prix publics web, uniquement pour les nouvelles lignes encore sans prix.
  const stillUnpriced = unpriced.filter((op) => op.unit_price_eur === null);
  if (stillUnpriced.length) {
    const estimate = await estimateMaterialUnitPricesEur(
      stillUnpriced.map((op) => ({ name: op.label!.trim(), quantity: op.quantity ?? 1, specifications: null })),
      instruction,
    );
    for (const op of stillUnpriced) {
      const price = lookupEstimatedUnitPrice(estimate.prices, op.label!.trim());
      if (price === null) continue;
      op.unit_price_eur = price;
      pricingNotes.push(
        `« ${op.label} » : prix estimé ${estimate.webUsed ? `d'après ${estimate.sources.slice(0, 3).join(", ") || "le web"}` : "(marché)"} — à valider.`,
      );
    }
  }

  return { ok: true, patch, pricingNotes };
}
