import { NextResponse } from "next/server";

import {
  LEAD_CHAT_JSON_SCHEMA,
  LeadChatTurnSchema,
  MAX_LEAD_CHAT_QUESTIONS,
  type LeadChatMessage,
} from "@/lib/leads/chat-schema";
import { mistralChatParse } from "@/lib/ai/mistral";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_CONTENT = 600;

/** Repli si l'IA est indisponible : le tunnel ne doit jamais se bloquer. */
function fallbackTurn(answered: number, tradeLabel: string) {
  const questions = [
    `Décris-moi le problème ou le projet en quelques mots (${tradeLabel.toLowerCase()}).`,
    "Depuis quand est-ce que ça dure, et est-ce urgent ?",
    "Peux-tu préciser les dimensions, la surface ou le nombre d’éléments concernés ?",
  ];
  const question = questions[answered] ?? null;
  return { question, done: question === null, summary: "" };
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

  // Garde-fou : on ne laisse pas l'IA prolonger l'interrogatoire indéfiniment.
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
          content: `Tu qualifies la demande d'un particulier pour un artisan « ${tradeLabel} ».
Règles :
1. UNE seule question à la fois, courte, concrète, en français, tutoiement.
2. Questions utiles à un chiffrage : nature exacte du problème, localisation dans le logement, ancienneté, dimensions ou surface, urgence, matériel existant.
3. Ne demande JAMAIS le nom, l'e-mail, le téléphone ni l'adresse : c'est géré ailleurs dans le parcours.
4. Ne donne aucun prix, aucun conseil technique, aucun diagnostic.
5. done=true dès que tu as de quoi décrire le chantier (${MAX_LEAD_CHAT_QUESTIONS} questions maximum).
6. summary : le besoin reformulé à la 1re personne (« Je dois… »), 1 à 3 phrases, sans invention.`,
        },
        {
          role: "user",
          content: transcript
            ? `Échange en cours :\n${transcript}\n\nDonne la prochaine question, ou termine.`
            : "Aucun échange pour l'instant : pose la première question.",
        },
      ],
      "lead_chat_turn",
      {
        temperature: 0.3,
        jsonSchema: LEAD_CHAT_JSON_SCHEMA,
        jsonExample: `{
  "question": "Où se situe la fuite exactement (sous l'évier, au plafond, au compteur) ?",
  "done": false,
  "summary": ""
}`,
      },
    );

    // Cohérence : pas de question ⇒ terminé, et inversement.
    const done = turn.done || !turn.question;
    return NextResponse.json({
      question: done ? null : turn.question,
      done,
      summary: turn.summary,
    });
  } catch (err) {
    console.error("[estimation/chat]", err instanceof Error ? err.message : err);
    return NextResponse.json(fallbackTurn(answered, tradeLabel));
  }
}
