import {
  MAX_LEAD_CHAT_QUESTIONS,
  type LeadChatMessage,
  type LeadChatTurn,
} from "@/lib/leads/chat-schema";

/** Nombre minimum de réponses client avant de laisser l'IA clôturer le questionnaire. */
export const MIN_LEAD_CHAT_QUESTIONS = 3;

export function fallbackChatQuestion(answered: number, tradeLabel: string): string | null {
  const trade = tradeLabel.toLowerCase();
  const questions = [
    `Quel est exactement ton besoin en ${trade} ? Décris le problème ou le projet le plus précisément possible.`,
    "Où se situe l'intervention (pièce, étage, intérieur ou extérieur, type de bâtiment) ?",
    "Peux-tu préciser les dimensions, la surface, la quantité ou l'étendue des travaux ?",
    "Depuis quand c'est en place, y a-t-il une urgence, et as-tu des contraintes d'accès ou du matériel déjà installé ?",
  ];
  return questions[answered] ?? null;
}

function userAnswersText(messages: LeadChatMessage[]): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");
}

/**
 * Empêche l'IA de sauter le questionnaire : première question obligatoire,
 * minimum de réponses avant clôture, plafond au maximum configuré.
 */
export function normalizeChatTurn(
  turn: LeadChatTurn,
  answered: number,
  tradeLabel: string,
  messages: LeadChatMessage[],
): { question: string | null; done: boolean; summary: string } {
  let question = turn.question?.trim() || null;
  let done = turn.done;
  let summary = turn.summary.trim();

  if (answered >= MAX_LEAD_CHAT_QUESTIONS) {
    return {
      question: null,
      done: true,
      summary: summary || userAnswersText(messages),
    };
  }

  if (answered === 0) {
    if (!question) question = fallbackChatQuestion(0, tradeLabel);
    return { question, done: false, summary: "" };
  }

  if (answered < MIN_LEAD_CHAT_QUESTIONS) {
    done = false;
    if (!question) question = fallbackChatQuestion(answered, tradeLabel);
  }

  if (question) done = false;

  if (done && !summary) summary = userAnswersText(messages);

  return {
    question: done ? null : question,
    done,
    summary,
  };
}

/** Description enrichie transmise aux artisans : synthèse + fil de questions/réponses. */
export function formatLeadDescription(summary: string, messages: LeadChatMessage[]): string {
  const body = summary.trim() || userAnswersText(messages);
  const exchanges = messages.filter((m) => m.content.trim());
  if (exchanges.length <= 1) return body.slice(0, 4000);

  const qaLines: string[] = [];
  for (const m of exchanges) {
    if (m.role === "assistant") qaLines.push(`Question : ${m.content}`);
    else qaLines.push(`Réponse : ${m.content}`);
  }

  return `${body}\n\n--- Précisions recueillies ---\n${qaLines.join("\n")}`.slice(0, 4000);
}
