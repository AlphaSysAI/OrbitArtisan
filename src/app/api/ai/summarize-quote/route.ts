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
  const quoteId = body?.quoteId ? String(body.quoteId) : "";

  if (!quoteId) return NextResponse.json({ error: "missing_quote_id" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  // Peut être soit artisan (via profiles), soit client (via customer_user_id).
  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id,status,customer_user_id,artisan_id,customer_name,customer_email,conversation_id,signed_at,signed_by_name,rejected_at,grand_total,notes,created_at,updated_at",
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (!quote) return NextResponse.json({ error: "quote_not_found" }, { status: 404 });

  const { data: artisanProfile } = await supabase
    .from("profiles")
    .select("id, business_name, description")
    .eq("user_id", user.id)
    .maybeSingle();

  const viewerIsArtisan = !!artisanProfile?.id && artisanProfile.id === quote.artisan_id;
  const viewerIsClient = quote.customer_user_id === user.id;
  if (!viewerIsArtisan && !viewerIsClient) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Fournit une image du contexte via les messages de la conversation si possible.
  const conversationId = quote.conversation_id;
  let contextText = "";
  if (conversationId) {
    const { data: messages } = await supabase
      .from("messages")
      .select("sender_user_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(16);
    contextText = (messages ?? [])
      .map((m) => {
        const who = viewerIsClient ? (m.sender_user_id === user.id ? "Client (toi)" : "Artisan") : m.sender_user_id === user.id ? "Artisan (toi)" : "Client";
        return `${who}: ${m.body}`;
      })
      .join("\n");
  }

  const { data: serviceLines } = await supabase
    .from("quote_services")
    .select("service_title,duration_minutes,unit_price,line_total")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true });

  const { data: materialLines } = await supabase
    .from("quote_materials")
    .select("label,quantity,unit_price,line_total")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true });

  const openai = getOpenAI();
  const artisanName = (artisanProfile?.business_name ?? "").toString() || "Artisan";
  const artisanDescription = artisanProfile?.description ?? "";
  const customerName = quote.customer_name || quote.customer_email || "Client";

  const prompt = `
Tu es un assistant qui résume un devis et la discussion associée.
Objectif: produire un résumé clair en FR pour aider à décider.

Format de sortie (texte libre, pas de JSON):
1) Besoin du client (1-3 lignes)
2) Ce que l'artisan propose (1-3 lignes)
3) Points à valider (bullet points)
4) Prochaine étape (1-2 lignes)

Contraintes:
- Ne pas inventer de détails non présents.
- Si une info manque: écrire "à confirmer".
- Ton: pro, concis, chaleureux et rassurant.

Devis:
- Statut: ${quote.status}
- Artisan: ${artisanName}
- Style / description artisan: ${artisanDescription || "—"}
- Client: ${customerName}
- Montant total (centimes): ${quote.grand_total ?? 0}
- Notes (si présentes): ${quote.notes ?? "—"}

Prestations:
${(serviceLines ?? [])
  .slice(0, 10)
  .map((s: any) => `- ${s.service_title} (${s.duration_minutes} min)`)
  .join("\n") || "—"}

Fournitures:
${(materialLines ?? [])
  .slice(0, 10)
  .map((m: any) => `- ${m.label} x${m.quantity}`)
  .join("\n") || "—"}

Contexte messages (extrait):
${contextText || "—"}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      { role: "system", content: "Résumé de devis pour AlphaSys-Artisan." },
      { role: "user", content: prompt },
    ],
  });

  const summary = safeTrim(completion.choices[0]?.message?.content ?? "", 4000);
  if (!summary) return NextResponse.json({ error: "empty_response" }, { status: 500 });

  return NextResponse.json({ summary });
}

