import { NextResponse } from "next/server";

import { getOpenAI } from "@/lib/openai/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function safeTrim(s: string, maxLen: number) {
  const t = s.trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const conversationId = body?.conversationId ? String(body.conversationId) : "";

  const selectedServices = Array.isArray(body?.selectedServices) ? body.selectedServices : [];
  const materials = Array.isArray(body?.materials) ? body.materials : [];
  const customerName = body?.customerName ? String(body.customerName) : "";

  if (!conversationId) return NextResponse.json({ error: "missing_conversation_id" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  // Artisan requis.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, business_name, description, labor_rate_per_hour")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id) return NextResponse.json({ error: "not_artisan" }, { status: 403 });

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, artisan_id, customer_user_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv || conv.artisan_id !== profile.id) return NextResponse.json({ error: "conversation_forbidden" }, { status: 403 });

  // Contexte messages (limité).
  const { data: messages } = await supabase
    .from("messages")
    .select("sender_user_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(12);

  const lastMessages = messages ?? [];
  const contextText = lastMessages
    .map((m) => {
      const who = m.sender_user_id === user.id ? "Artisan (toi)" : "Client";
      return `${who}: ${m.body}`;
    })
    .join("\n");

  const { data: cp } = await supabase
    .from("customer_profiles")
    .select("display_name")
    .eq("user_id", conv.customer_user_id)
    .maybeSingle();
  const cn = customerName || cp?.display_name || "le client";

  const servicesText = selectedServices
    .slice(0, 10)
    .map((s: any) => `${String(s.title ?? "")} (${s.duration ?? ""} min)`)
    .filter(Boolean)
    .join(", ");

  const materialsText = materials
    .slice(0, 20)
    .map((m: any) => `${String(m.label ?? "")} x${m.quantity ?? 1}`)
    .filter(Boolean)
    .join(", ");

  const openai = getOpenAI();
  const prompt = `
Tu es un assistant pour un artisan français.
Objectif: rédiger une section "Notes" (texte libre) pour un devis.

Contraintes:
- Répondre en FR.
- Ne pas inventer des prix/dates non présents.
- Produire un texte utilisable directement comme notes du devis.
- Style: clair, structuré (lignes courtes), orienté validation.
- Ton: pro + chaleureux + rassurant (sans être infantile).
- Mentionner brièvement: compréhension du besoin, conditions/points à confirmer, prochaines étapes.
- Longueur max: 600 caractères.

Artisan:
- Nom: ${profile.business_name}
- Description / style: ${profile.description ?? "—"}

Client: ${cn}
Prestations sélectionnées: ${servicesText || "non précisé"}
Fournitures saisies: ${materialsText || "aucune"}

Historique (extrait):
${contextText}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: "Génération de notes pour devis." },
      { role: "user", content: prompt },
    ],
  });

  const notes = safeTrim(completion.choices[0]?.message?.content ?? "", 2500);
  if (!notes) return NextResponse.json({ error: "empty_response" }, { status: 500 });

  return NextResponse.json({ notes });
}

