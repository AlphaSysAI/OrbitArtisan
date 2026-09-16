import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { looksLikeQuoteRequest } from "@/lib/ai/assistant-fast-path";
import type { AssistantApiResponse } from "@/lib/ai/assistant-schema";
import { mistralChatParse } from "@/lib/ai/mistral";
import { matchContactByQuery, type ContactCandidate } from "@/lib/ai/match-contact";
import {
  LEAD_CHAT_JSON_EXAMPLE,
  LEAD_CHAT_JSON_SCHEMA,
  LeadChatTurnSchema,
  MAX_LEAD_CHAT_QUESTIONS,
  type LeadChatMessage,
} from "@/lib/leads/chat-schema";
import { fallbackChatQuestion, formatLeadDescription, normalizeChatTurn } from "@/lib/leads/chat-turn";

export type QuoteIntakeStep = "client_kind" | "client_detail" | "work";

export type QuoteIntakeState = {
  active: true;
  step: QuoteIntakeStep;
  clientKind: "known" | "new" | null;
  customerUserId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerMatched: boolean;
  workChat: LeadChatMessage[];
  workSummary: string | null;
};

const MIN_WORK_QUESTIONS = 2;

const CUSTOMER_HINT_STOPWORDS = new Set([
  "un",
  "une",
  "le",
  "la",
  "les",
  "ce",
  "cet",
  "cette",
  "mon",
  "ma",
  "mes",
  "son",
  "sa",
  "ses",
  "autre",
  "nouveau",
  "nouvelle",
  "lui",
  "elle",
  "eux",
  "meme",
  "memes",
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Détail chantier cité explicitement dans le message (hors contexte écran). */
export function hasWorkDetailInMessage(message: string): boolean {
  const m = normalize(message);
  return /\b(mur|m2|m²|ml|parpaing|carrelage|renov|renovation|installation|reparation|peinture|plomberie|toiture|fenetre|porte|electric|sdb|cuisine|chambre|metre|intervention|chantier|fuite|dalle|ite|iti|couverture|menuiserie|macon|gros oeuvre|structure)\b/.test(
    m,
  );
}

/** Nom de client cité dans le message (pas « pour un autre client »). */
export function extractCustomerHintFromMessage(message: string): string | null {
  const m = normalize(message);
  const patterns = [/\bpour\s+(.+)/, /\bclient\s+(.+)/, /\bchez\s+(.+)/];
  for (const re of patterns) {
    const hit = m.match(re);
    if (!hit?.[1]) continue;
    let rest = hit[1].trim().split(/[:—-]/)[0]?.trim() ?? "";
    if (/^autre\s+(client|contact)/.test(rest)) continue;
    const tokens = rest.split(/\s+/).filter(Boolean);
    while (tokens.length && CUSTOMER_HINT_STOPWORDS.has(tokens[0]!)) tokens.shift();
    if (!tokens.length) continue;
    const name = tokens.slice(0, 3).join(" ");
    if (name.length >= 2 && !/^autre\s+(client|contact)/.test(name)) return name;
  }
  return null;
}

/** Devis explicitement pour l’écran ouvert (conversation, fiche client…). */
export function looksLikeQuoteForPageContext(message: string): boolean {
  const m = normalize(message);
  return /\b(suite a cette|cette demande|ce client|cette conversation|pour lui|pour elle|ce message|demande recue|demande qualifiee|a partir de ce|depuis ce|depuis cette|avec ce client|avec cette demande)\b/.test(
    m,
  );
}

/** L’artisan refuse le client du contexte et veut repartir de zéro. */
export function looksLikeRejectPageContextCustomer(message: string): boolean {
  const m = normalize(message);
  return (
    looksLikeExplicitNewQuoteRequest(message) ||
    /\b(pas (ce|cet|cette)|autre (client|contact)|nouveau client|client different|client différent|pas pour)\b/.test(
      m,
    )
  );
}

/** Nouveau devis sans lien avec l’écran ouvert. */
export function looksLikeExplicitNewQuoteRequest(message: string): boolean {
  const m = normalize(message);
  return /\b(nouveau devis|nouvel devis|autre client|autre contact|different client|client different|partir de zero|from scratch)\b/.test(
    m,
  );
}

export function looksLikeVagueQuoteRequest(message: string): boolean {
  if (!looksLikeQuoteRequest(message)) return false;
  if (looksLikeExplicitNewQuoteRequest(message)) return true;
  if (looksLikeQuoteForPageContext(message)) return false;

  const m = normalize(message);
  if (m.length > 120) return false;

  return !hasWorkDetailInMessage(message) && !extractCustomerHintFromMessage(message);
}

/** Lance le questionnaire guidé (client + travaux). */
export function shouldStartQuoteIntake(message: string, hasActiveIntake: boolean): boolean {
  if (hasActiveIntake) return true;
  if (!looksLikeQuoteRequest(message)) return false;
  if (looksLikeQuoteForPageContext(message)) return false;
  if (looksLikeExplicitNewQuoteRequest(message)) return true;
  return looksLikeVagueQuoteRequest(message);
}

export function hasEnoughWorkForQuoteBuild(message: string, workDescription: string | null | undefined): boolean {
  const desc = workDescription?.trim() ?? "";
  if (desc.length >= 20) return true;
  return hasWorkDetailInMessage(message);
}

export function parseQuoteIntakeCancel(message: string): boolean {
  return /\b(annule|annuler|stop|laisse|oublie|quitte)\b/.test(normalize(message));
}

export function parseClientKind(message: string): "known" | "new" | null {
  const m = normalize(message);
  if (/\b(nouveau|nouvelle|new|premier|premiere|inconnu|pas encore|jamais|prospect)\b/.test(m)) {
    return "new";
  }
  if (/\b(connu|connue|existant|existante|deja|contact|mes clients|dans mes contacts|client actuel)\b/.test(m)) {
    return "known";
  }
  return null;
}

function extractEmail(text: string): string | null {
  const m = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  return m?.[0]?.toLowerCase() ?? null;
}

function stripEmail(text: string): string {
  return text.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "").replace(/\s+/g, " ").trim();
}

export function createQuoteIntakeStart(): QuoteIntakeState {
  return {
    active: true,
    step: "client_kind",
    clientKind: null,
    customerUserId: null,
    customerName: null,
    customerEmail: null,
    customerMatched: false,
    workChat: [],
    workSummary: null,
  };
}

function clarifyResponse(
  reply: string,
  intake: QuoteIntakeState,
  suggestions: string[],
): AssistantApiResponse {
  return {
    reply,
    intent: "clarify",
    quoteIntake: intake,
    suggestions,
  };
}

async function nextWorkQuestion(
  intake: QuoteIntakeState,
  tradeLabel: string,
  userMessage: string,
): Promise<{ intake: QuoteIntakeState; done: boolean; summary: string }> {
  const workChat: LeadChatMessage[] = [...intake.workChat];
  if (userMessage.trim()) {
    workChat.push({ role: "user", content: userMessage.trim() });
  }

  const answered = workChat.filter((m) => m.role === "user").length;
  const transcript = workChat
    .map((m) => `${m.role === "assistant" ? "Assistant" : "Artisan"}: ${m.content}`)
    .join("\n");

  let turn;
  try {
    turn = await mistralChatParse(
      LeadChatTurnSchema,
      [
        {
          role: "system",
          content: `Tu qualifies un chantier pour qu'un artisan BTP prépare un devis pour son client${intake.customerName ? ` (${intake.customerName})` : ""}.
Corps de métier / activité : ${tradeLabel}.
Règles :
1. UNE seule question courte à la fois, tutoiement, français.
2. Ne clôture (done=true) qu'après au moins ${MIN_WORK_QUESTIONS} réponses de l'artisan couvrant : nature du travail, localisation/zone, dimensions ou quantités (ou contraintes/urgence).
3. Chaque question reprend un détail concret de la dernière réponse.
4. Pas de prix ni de conseil réglementaire — uniquement collecter les infos pour chiffrer.
5. summary (si done) : description complète du chantier à chiffrer, 2-4 phrases, 3e personne ou infinitif (« Rénovation SDB… »).`,
        },
        {
          role: "user",
          content: transcript
            ? `Échange (${answered} réponse(s) artisan) :\n${transcript}\n\nPose la prochaine question ou termine si c'est suffisant.`
            : "L'artisan veut créer un devis. Pose la première question sur la nature exacte des travaux.",
        },
      ],
      "assistant_quote_work_turn",
      {
        temperature: 0.25,
        jsonSchema: LEAD_CHAT_JSON_SCHEMA,
        jsonExample: LEAD_CHAT_JSON_EXAMPLE,
      },
    );
  } catch {
    const question = fallbackChatQuestion(answered, tradeLabel);
    const done = answered >= MIN_WORK_QUESTIONS && !question;
    return {
      intake: {
        ...intake,
        step: "work",
        workChat: done
          ? workChat
          : [...workChat, ...(question ? [{ role: "assistant" as const, content: question }] : [])],
        workSummary: done ? formatLeadDescription("", workChat) : null,
      },
      done,
      summary: done ? formatLeadDescription("", workChat) : "",
    };
  }

  const normalized = normalizeChatTurn(turn, answered, tradeLabel, workChat);
  const done = normalized.done && answered >= MIN_WORK_QUESTIONS;
  const summary = done ? formatLeadDescription(normalized.summary, workChat) : "";

  const nextChat = [...workChat];
  if (!done && normalized.question) {
    nextChat.push({ role: "assistant", content: normalized.question });
  }

  return {
    intake: {
      ...intake,
      step: "work",
      workChat: nextChat,
      workSummary: done ? summary : null,
    },
    done,
    summary,
  };
}

export type QuoteIntakeTurnParams = {
  supabase: SupabaseClient;
  profile: {
    id: string;
    business_name: string | null;
    description: string | null;
    labor_rate_per_hour: number | null;
  };
  linked: ContactCandidate[];
  message: string;
  intake: QuoteIntakeState | null;
  startNew: boolean;
};

export type QuoteIntakeProcessResult =
  | { kind: "continue"; response: AssistantApiResponse }
  | { kind: "cancel" }
  | { kind: "build"; intake: QuoteIntakeState; instruction: string; customerLabel: string | null; matched: ReturnType<typeof matchContactByQuery> };

/**
 * Gère un tour du questionnaire devis (client + qualification travaux).
 * Retourne null si le message ne relève pas de ce flux.
 */
export async function processQuoteIntakeTurn(
  params: QuoteIntakeTurnParams,
): Promise<QuoteIntakeProcessResult | null> {
  const { message, linked, profile, intake, startNew } = params;

  if (parseQuoteIntakeCancel(message)) {
    return { kind: "cancel" };
  }

  let state = intake;
  if (!state && startNew) {
    state = createQuoteIntakeStart();
    return {
      kind: "continue",
      response: clarifyResponse(
        "Parfait — on prépare ce devis ensemble.\n\nC’est pour un client déjà dans tes contacts, ou un nouveau client ?",
        state,
        ["Client connu", "Nouveau client"],
      ),
    };
  }

  if (!state?.active) return null;

  const tradeLabel = profile.business_name?.trim() || profile.description?.trim() || "travaux";

  if (state.step === "client_kind") {
    let kind = parseClientKind(message);
    if (!kind) {
      const matched = matchContactByQuery(message, linked);
      if (matched) {
        kind = "known";
        state = {
          ...state,
          step: "work",
          clientKind: "known",
          customerUserId: matched.contact.customerUserId || null,
          customerName: matched.contact.label,
          customerEmail: matched.contact.email,
          customerMatched: true,
        };
        const { intake: next, done, summary } = await nextWorkQuestion(state, tradeLabel, "");
        if (done) {
          return {
            kind: "build",
            intake: next,
            instruction: summary,
            customerLabel: next.customerName,
            matched,
          };
        }
        const q = next.workChat.at(-1)?.content ?? "Décris les travaux à chiffrer.";
        return {
          kind: "continue",
          response: clarifyResponse(
            `OK — devis pour ${matched.contact.label}.\n\n${q}`,
            next,
            [],
          ),
        };
      }
    }

    if (!kind) {
      return {
        kind: "continue",
        response: clarifyResponse(
          "Je n’ai pas compris — client connu (déjà dans tes contacts) ou nouveau ?",
          state,
          ["Client connu", "Nouveau client"],
        ),
      };
    }

    state = { ...state, step: "client_detail", clientKind: kind };
    if (kind === "known") {
      const names = linked.slice(0, 6).map((c) => c.label);
      return {
        kind: "continue",
        response: clarifyResponse(
          names.length
            ? `Quel client ? Donne-moi son nom (${names.slice(0, 4).join(", ")}${names.length > 4 ? "…" : ""}).`
            : "Tu n’as pas encore de contact lié — donne-moi le nom du client (ou dis « nouveau client »).",
          state,
          names.slice(0, 4),
        ),
      };
    }

    return {
      kind: "continue",
      response: clarifyResponse(
        "Quel est le nom du nouveau client ? Tu peux ajouter son e-mail sur la même ligne si tu l’as.",
        state,
        [],
      ),
    };
  }

  if (state.step === "client_detail") {
    if (state.clientKind === "known") {
      const matched = matchContactByQuery(message, linked);
      if (!matched) {
        return {
          kind: "continue",
          response: clarifyResponse(
            `Je ne retrouve pas ce client dans tes contacts. Réessaie avec le nom exact, ou dis « nouveau client ».`,
            state,
            linked.slice(0, 4).map((c) => c.label),
          ),
        };
      }
      state = {
        ...state,
        step: "work",
        customerUserId: matched.contact.customerUserId || null,
        customerName: matched.contact.label,
        customerEmail: matched.contact.email,
        customerMatched: true,
      };
      const { intake: next, done, summary } = await nextWorkQuestion(state, tradeLabel, "");
      if (done) {
        return {
          kind: "build",
          intake: next,
          instruction: summary,
          customerLabel: next.customerName,
          matched,
        };
      }
      const q = next.workChat.at(-1)?.content ?? "Quels travaux dois-tu chiffrer ?";
      return {
        kind: "continue",
        response: clarifyResponse(`Parfait — ${matched.contact.label}.\n\n${q}`, next, []),
      };
    }

    const email = extractEmail(message);
    const name = stripEmail(message).replace(/^[,:-\s]+/, "").trim();
    if (name.length < 2) {
      return {
        kind: "continue",
        response: clarifyResponse(
          "Il me faut au moins un nom pour ce client (tu pourras compléter l’e-mail dans le devis).",
          state,
          [],
        ),
      };
    }

    state = {
      ...state,
      step: "work",
      customerName: name,
      customerEmail: email,
      customerMatched: false,
    };
    const { intake: next, done, summary } = await nextWorkQuestion(state, tradeLabel, "");
    if (done) {
      return {
        kind: "build",
        intake: next,
        instruction: summary,
        customerLabel: next.customerName,
        matched: null,
      };
    }
    const q = next.workChat.at(-1)?.content ?? "Quels travaux pour ce client ?";
    return {
      kind: "continue",
      response: clarifyResponse(`Noté — ${name}${email ? ` (${email})` : ""}.\n\n${q}`, next, []),
    };
  }

  if (state.step === "work") {
    if (looksLikeQuoteIntakeDone(message) && state.workChat.some((m) => m.role === "user")) {
      const summary = formatLeadDescription(
        state.workSummary ?? "",
        [...state.workChat, { role: "user", content: message.trim() }],
      );
      const matched = state.customerMatched
        ? matchContactByQuery(state.customerName ?? "", linked)
        : null;
      return {
        kind: "build",
        intake: { ...state, workSummary: summary },
        instruction: summary,
        customerLabel: state.customerName,
        matched,
      };
    }

    const { intake: next, done, summary } = await nextWorkQuestion(state, tradeLabel, message);
    if (done) {
      const matched =
        next.customerUserId || next.customerName
          ? matchContactByQuery(next.customerName ?? message, linked)
          : null;
      return {
        kind: "build",
        intake: next,
        instruction: summary,
        customerLabel: next.customerName,
        matched,
      };
    }
    const q = next.workChat.at(-1)?.content ?? "Peux-tu préciser ?";
    const answered = next.workChat.filter((m) => m.role === "user").length;
    const suggestions =
      answered >= MAX_LEAD_CHAT_QUESTIONS - 1 ? ["C’est suffisant, génère le devis"] : [];
    return {
      kind: "continue",
      response: clarifyResponse(q, next, suggestions),
    };
  }

  return null;
}

export function looksLikeQuoteIntakeDone(message: string): boolean {
  return /\b(suffisant|genere|génère|genere le|génère le|lance|valide|ok pour le devis|prets|prêt)\b/.test(
    normalize(message),
  );
}
