import { NextResponse } from "next/server";

import { qualifyLead } from "@/lib/ai/qualify-lead";
import type { LeadChatMessage } from "@/lib/leads/chat-schema";
import { buildEstimate, resolvePricingContext } from "@/lib/leads/pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTradeCategory, findTrade } from "@/lib/trades/taxonomy";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_DESCRIPTION = 4000;
const MAX_MESSAGE = 600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Qualification IA d'une demande de particulier, puis chiffrage croisé avec les
 * tarifs des artisans candidats. Route publique : le tunnel d'estimation
 * s'utilise sans compte. Aucune écriture en base ici — c'est l'action serveur
 * `finalizeLead` qui persiste le résultat.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const description = String(body?.description ?? "").trim().slice(0, MAX_DESCRIPTION);
  if (description.length < 10) {
    return NextResponse.json({ error: "missing_description" }, { status: 400 });
  }

  const categoryId = String(body?.categoryId ?? "").trim() || null;
  const tradeId = String(body?.tradeId ?? "").trim() || null;
  const mediaCount = Number.isFinite(Number(body?.mediaCount)) ? Number(body.mediaCount) : 0;

  const artisanIds: string[] = Array.isArray(body?.artisanIds)
    ? (body.artisanIds as unknown[])
        .map((id) => String(id ?? "").trim())
        .filter((id) => UUID_RE.test(id))
        .slice(0, 3)
    : [];

  const messages: LeadChatMessage[] = Array.isArray(body?.messages)
    ? (body.messages as LeadChatMessage[])
        .slice(-12)
        .map((m) => ({
          role: m?.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: String(m?.content ?? "").trim().slice(0, MAX_MESSAGE),
        }))
        .filter((m) => m.content)
    : [];

  const category = findTradeCategory(categoryId);
  const trade = findTrade(categoryId, tradeId);

  let qualification;
  try {
    qualification = await qualifyLead({
      description,
      tradeLabel: trade?.label ?? null,
      categoryLabel: category?.label ?? null,
      messages,
      mediaCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[qualify-lead] parse error", message);

    if (message.includes("401") || message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "ai_auth_failed" }, { status: 502 });
    }
    if (message.includes("schema_validation_failed")) {
      return NextResponse.json({ error: "ai_schema_failed" }, { status: 500 });
    }
    return NextResponse.json({ error: "ai_parse_failed" }, { status: 500 });
  }

  const supabase = await createSupabaseServerClient();
  const pricing = await resolvePricingContext(supabase, { artisanIds, categoryId });
  const estimate = buildEstimate(qualification, pricing);

  return NextResponse.json({ qualification, pricing, estimate });
}
