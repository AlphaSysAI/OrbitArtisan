import { z } from "zod";

import type { LeadQualification } from "@/lib/ai/qualify-lead-schema";
import { findTrade, findTradeCategory, isValidTradeSelection } from "@/lib/trades/taxonomy";

/**
 * Lots d'une demande de particulier : un par corps d'état nécessaire. Proposés par
 * l'IA, validés par le client, chacun reçoit jusqu'à 3 artisans du métier. Un artisan
 * ne voit que son lot (résumé dédié), jamais les autres lots en détail.
 * `leads.lots` vide = demande mono-métier historique.
 */
export const MAX_LEAD_LOTS = 8;
const MAX_SUMMARY = 800;

export type LeadLot = { trade_category: string; trade: string | null; summary: string };

const LeadLotSchema = z
  .object({
    trade_category: z.string().trim().min(1),
    trade: z
      .string()
      .trim()
      .nullable()
      .optional()
      .transform((v) => v || null),
    summary: z.string().trim().max(MAX_SUMMARY * 2).transform((v) => v.slice(0, MAX_SUMMARY)),
  })
  .refine((l) => (l.trade ? isValidTradeSelection(l.trade_category, l.trade) : !!findTradeCategory(l.trade_category)), {
    message: "invalid_trade",
  });

/** Lots valides, dédoublonnés (catégorie + métier), plafonnés. Les entrées invalides sont ignorées. */
export function parseLeadLots(raw: unknown): LeadLot[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LeadLot[] = [];
  for (const item of raw) {
    const parsed = LeadLotSchema.safeParse(item);
    if (!parsed.success) continue;
    const key = `${parsed.data.trade_category}|${parsed.data.trade ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ trade_category: parsed.data.trade_category, trade: parsed.data.trade ?? null, summary: parsed.data.summary });
    if (out.length === MAX_LEAD_LOTS) break;
  }
  return out;
}

/** « Couvreur », à défaut le libellé de la catégorie. */
export function lotLabel(lot: { trade_category: string | null; trade: string | null }): string {
  return findTrade(lot.trade_category, lot.trade)?.label ?? findTradeCategory(lot.trade_category)?.label ?? "Autre métier";
}

type LeadForView = {
  lots: unknown;
  trade_category: string | null;
  trade: string | null;
  description: string;
  estimate_min: number | null;
  estimate_max: number | null;
  ai_qualification: LeadQualification | null;
};

export type ArtisanLeadView = {
  multiLot: boolean;
  tradeCategory: string | null;
  trade: string | null;
  /** Ce que l'artisan doit chiffrer : son lot en multi-métiers, la demande entière sinon. */
  description: string;
  otherLotLabels: string[];
  /** Fourchette et synthèse IA couvrent tout le projet : masquées en multi-métiers. */
  estimateMin: number | null;
  estimateMax: number | null;
  qualification: LeadQualification | null;
};

/** Vue d'une demande pour l'artisan d'un lot donné (lot_index de sa mise en relation). */
export function leadViewForLot(lead: LeadForView, lotIndex: number | null | undefined): ArtisanLeadView {
  const lots = parseLeadLots(lead.lots);
  if (lots.length <= 1) {
    return {
      multiLot: false,
      tradeCategory: lots[0]?.trade_category ?? lead.trade_category,
      trade: lots[0] ? lots[0].trade : lead.trade,
      description: lead.description,
      otherLotLabels: [],
      estimateMin: lead.estimate_min,
      estimateMax: lead.estimate_max,
      qualification: lead.ai_qualification,
    };
  }
  const index = Math.min(Math.max(lotIndex ?? 0, 0), lots.length - 1);
  const lot = lots[index]!;
  return {
    multiLot: true,
    tradeCategory: lot.trade_category,
    trade: lot.trade,
    description: lot.summary || lead.description,
    otherLotLabels: lots.filter((_, i) => i !== index).map(lotLabel),
    estimateMin: null,
    estimateMax: null,
    qualification: null,
  };
}
