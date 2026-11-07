import { z } from "zod";

import type { TechnicalSheetContent } from "@/lib/technical-sheets/types";

const line = z.string().trim().min(2).max(400);

/** Contenu d'une fiche générée par l'IA : validé avant enregistrement et à la lecture. */
export const technicalSheetContentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(3).max(600),
  duration: z.string().trim().max(120).optional(),
  tools: z.array(line).max(20),
  materials: z.array(line).max(25),
  safety: z.array(line).min(1).max(12),
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(160),
        details: z.array(line).min(1).max(10),
        warning: z.string().trim().max(400).optional(),
      }),
    )
    .min(2)
    .max(15),
  checks: z.array(line).max(15),
  norms: z
    .array(z.object({ ref: z.string().trim().min(2).max(80), label: z.string().trim().max(200) }))
    .max(10),
}) satisfies z.ZodType<TechnicalSheetContent>;

/** Réponse de l'IA : soit une fiche, soit un refus motivé (demande hors bâtiment, dangereuse…). */
export const technicalSheetAiResponseSchema = z.object({
  refused: z.boolean(),
  refusalReason: z.string().max(400).optional(),
  sheet: technicalSheetContentSchema.optional(),
});

export function parseStoredSheetContent(value: unknown): TechnicalSheetContent | null {
  const parsed = technicalSheetContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
