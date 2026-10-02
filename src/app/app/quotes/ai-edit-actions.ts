"use server";

import { z } from "zod";

import { MISTRAL_EXTRACTION_MODEL, mistralChatParse } from "@/lib/ai/mistral";
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
import { applyMaterialsMargin } from "@/lib/billing/materials-margin";
import { findReferencePrice } from "@/lib/ai/recipe-reference-prices";

const snapshotSchema = z.object({
  lines: z
    .array(
      z.object({
        id: z.string().max(80),
        source: z.enum(["manual", "supplier"]),
        label: z.string().max(300),
        quantity: z.number().finite(),
        unitPriceEur: z.number().finite().nullable(),
        unit: z.string().max(20).nullable().optional(),
      }),
    )
    .max(200),
  labor: z.array(z.object({ id: z.string().max(80), title: z.string().max(300), hours: z.number().finite() })).max(50),
  laborRateEur: z.number().finite().nullable(),
  notes: z.string().max(5000),
});

type AiEditResult =
  | { ok: true; patch: FormPatch; pricingNotes: string[] }
  | { ok: false; error: "auth" | "invalid" | "rate_limited" | "ai_failed" };

async function llmFormPatch(snapshot: QuoteFormSnapshot, instruction: string): Promise<FormPatch> {
  return mistralChatParse(
    formPatchSchema,
    [
      { role: "system", content: FORM_PATCH_SYSTEM_PROMPT },
      { role: "user", content: `DEVIS ACTUEL\n${describeSnapshot(snapshot)}\n\nCONSIGNE :\n« ${instruction} »` },
    ],
    "quote_form_patch",
    {
      jsonSchema: FORM_PATCH_JSON_SCHEMA as unknown as Record<string, unknown>,
      strictSchema: true,
      model: MISTRAL_EXTRACTION_MODEL,
      temperature: 0,
      maxTokens: 2000,
    },
  );
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

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("materials_margin_rate")
    .eq("id", auth.profileId)
    .maybeSingle();
  const marginRate = Number(profile?.materials_margin_rate ?? 0) || 0;
  const marginNote = marginRate > 0 ? `, ta marge de ${String(marginRate).replace(".", ",")} % incluse` : "";

  // 2. Barème de la bibliothèque d'ouvrages (même article, même unité), marge appliquée.
  for (const op of unpriced) {
    if (op.unit_price_eur !== null) continue;
    const reference = findReferencePrice(op.label!.trim(), op.unit);
    if (!reference) continue;
    op.unit_price_eur = applyMaterialsMargin(reference.priceHtEur, marginRate);
    pricingNotes.push(`« ${op.label} » : prix du barème Soline (${reference.referenceName})${marginNote} — à valider.`);
  }

  // 3. Prix publics web, uniquement pour les nouvelles lignes encore sans prix.
  const stillUnpriced = unpriced.filter((op) => op.unit_price_eur === null);
  if (stillUnpriced.length) {
    const estimate = await estimateMaterialUnitPricesEur(
      stillUnpriced.map((op) => ({ name: op.label!.trim(), quantity: op.quantity ?? 1, specifications: op.unit ?? null })),
      instruction,
    );
    for (const op of stillUnpriced) {
      const price = lookupEstimatedUnitPrice(estimate.prices, op.label!.trim());
      if (price === null) continue;
      // Prix d'achat estimé → prix de vente (marge des réglages, jamais affichée au client).
      op.unit_price_eur = applyMaterialsMargin(price, marginRate);
      pricingNotes.push(
        `« ${op.label} » : prix estimé ${estimate.webUsed ? `d'après ${estimate.sources.slice(0, 3).join(", ") || "le web"}` : "(marché)"}${marginNote} — à valider.`,
      );
    }
  }

  return { ok: true, patch, pricingNotes };
}
