import { NextResponse } from "next/server";

import {
  LEAD_CHAT_JSON_EXAMPLE,
  LEAD_CHAT_JSON_SCHEMA,
  LeadChatTurnSchema,
  MAX_LEAD_CHAT_QUESTIONS,
  type LeadChatMessage,
} from "@/lib/leads/chat-schema";
import {
  MIN_LEAD_CHAT_QUESTIONS,
  fallbackChatQuestion,
  normalizeChatTurn,
} from "@/lib/leads/chat-turn";
import { mistralChatParse } from "@/lib/ai/mistral";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_CONTENT = 600;

/** Repli si l'IA est indisponible : le tunnel ne doit jamais se bloquer. */
function fallbackTurn(answered: number, tradeLabel: string) {
  const question = fallbackChatQuestion(answered, tradeLabel);
  return {
    question,
    done: question === null,
    summary: "",
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const tradeLabel = String(body?.tradeLabel ?? "").trim().slice(0, 120);
  const messages: LeadChatMessage[] = Array.isArray(body?.messages)
    ? (body.messages as LeadChatMessage[])
        .slice(-12)
        .map((m) => ({
          role: m?.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: String(m?.content ?? "").trim().slice(0, MAX_CONTENT),
        }))
        .filter((m) => m.content)
    : [];

  if (!tradeLabel) {
    return NextResponse.json({ error: "missing_trade" }, { status: 400 });
  }

  const answered = messages.filter((m) => m.role === "user").length;

  if (answered >= MAX_LEAD_CHAT_QUESTIONS) {
    const summary = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ");
    return NextResponse.json({ question: null, done: true, summary });
  }

  const transcript = messages
    .map((m) => `${m.role === "assistant" ? "Toi" : "Client"}: ${m.content}`)
    .join("\n");

  try {
    const turn = await mistralChatParse(
      LeadChatTurnSchema,
      [
        {
          role: "system",
          content: `Tu qualifies la demande d'un particulier pour un artisan « ${tradeLabel} » via un mini-questionnaire.
Règles impératives :
1. UNE seule question à la fois, courte, concrète, en français, tutoiement.
2. Ne mets JAMAIS done=true avant d'avoir posé au moins ${MIN_LEAD_CHAT_QUESTIONS} questions distinctes et reçu les réponses — sauf plafond atteint (${MAX_LEAD_CHAT_QUESTIONS} questions max).
3. Suis cet ordre de collecte (une question par thème, approfondis si la réponse est vague) :
   a) Nature exacte du besoin ou du problème
   b) Localisation précise (pièce, étage, intérieur/extérieur, type de logement)
   c) Dimensions, surface, quantité ou étendue
   d) Ancienneté, urgence, contraintes d'accès, matériel ou revêtement existant
4. Chaque question DOIT reprendre un élément concret de la dernière réponse du client (« tu as dit… », « pour la cuisine que tu mentionnes… ») avant d'approfondir. Ne pose jamais une question générique si le client vient de donner un détail exploitable.
5. Ne demande JAMAIS nom, e-mail, téléphone ni adresse.
6. Ne donne aucun prix, conseil technique ni diagnostic.
7. summary (quand done=true) : synthèse complète à la 1re personne (« Je dois… »), 2 à 4 phrases, sans invention, intégrant toutes les réponses.`,
        },
        {
          role: "user",
          content: transcript
            ? `Échange en cours (${answered} réponse(s) client) :\n${transcript}\n\nPose la prochaine question utile, ou termine si les ${MIN_LEAD_CHAT_QUESTIONS} thèmes sont couverts.`
            : "Aucun échange : pose la première question sur la nature exacte du besoin.",
        },
      ],
      "lead_chat_turn",
      {
        temperature: 0.3,
        jsonSchema: LEAD_CHAT_JSON_SCHEMA,
        jsonExample: LEAD_CHAT_JSON_EXAMPLE,
      },
    );

    const normalized = normalizeChatTurn(turn, answered, tradeLabel, messages);
    return NextResponse.json(normalized);
  } catch (err) {
    console.error("[estimation/chat]", err instanceof Error ? err.message : err);
    return NextResponse.json(fallbackTurn(answered, tradeLabel));
  }
}
