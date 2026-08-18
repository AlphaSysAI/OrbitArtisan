import { NextResponse } from "next/server";

import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { mistralChatText } from "@/lib/ai/mistral";
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

  if (!conversationId) {
    return NextResponse.json({ error: "missing_conversation_id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, business_name, description")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id) {
    return NextResponse.json({ error: "not_artisan" }, { status: 403 });
  }

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, artisan_id, customer_user_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv || conv.artisan_id !== profile.id) {
    return NextResponse.json({ error: "conversation_forbidden" }, { status: 403 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("sender_user_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(10);

  const lastMessages = messages ?? [];
  const contextText = lastMessages
    .map((m) => {
      const who = m.sender_user_id === user.id ? "Artisan (toi)" : "Client";
      return `[${new Date(m.created_at).toISOString()}] ${who}: ${m.body}`;
    })
    .join("\n");

  const { data: cp } = await supabase
    .from("customer_profiles")
    .select("display_name, email")
    .eq("user_id", conv.customer_user_id)
    .maybeSingle();

  const customerName = formatContactDisplayName({
    profileName: cp?.display_name,
    email: cp?.email,
    fallback: "le client",
  });

  const prompt = `
Tu es un assistant de rédaction pour un artisan français.
Objectif: proposer une réponse professionnelle, chaleureuse et rassurante à partir du contexte ci-dessous.

Contraintes:
- Répondre en FR.
- Pas de mention de IA.
- Ton: pro + chaleureux + rassurant.
- Tutoiement (tu peux utiliser "tu" / "je").
- Commencer par une phrase de réassurance (ex: "Bien sûr", "Je comprends", "Pas de souci").
- Ne pas inventer de faits inconnus. Si une info manque, proposer une question de clarification.
- Laisser le client avancer (proposer un prochain pas: confirmation, RDV, détails).

Contexte artisan:
- Nom: ${profile.business_name}
- Style / description: ${profile.description ?? "—"}

Destinataire: ${customerName}

Historique (extrait):
${contextText}

Produis uniquement le texte de la réponse (pas de JSON, pas de titres).
Longueur max recommandée: 500 caractères.
`.trim();

  try {
    const suggestion = safeTrim(
      await mistralChatText(
        [
          {
            role: "system",
            content: "Génération de réponse pour messagerie client-artisan.",
          },
          { role: "user", content: prompt },
        ],
        0.4,
      ),
      2000,
    );

    if (!suggestion) {
      return NextResponse.json({ error: "empty_response" }, { status: 500 });
    }

    return NextResponse.json({ suggestion });
  } catch (err) {
    console.error("[suggest-reply] mistral error", err);
    return NextResponse.json({ error: "ai_failed" }, { status: 500 });
  }
}
