import "server-only";

import { z } from "zod";

import { mistralChatParse, MISTRAL_EXTRACTION_MODEL } from "@/lib/ai/mistral";
import { CLIENT_SHEET_LIBRARY } from "@/lib/technical-sheets/client/library";
import { isValidTradeSelection, TRADE_CATEGORIES } from "@/lib/trades/taxonomy";

/**
 * Assistant dépannage des particuliers : comprend la panne, donne d'abord les gestes de
 * sécurité, propose les fiches utiles, identifie le métier à faire venir et prépare la
 * demande qui sera envoyée aux artisans du coin (mise en relation).
 */

export const CLIENT_ASSISTANT_MODEL = process.env.MISTRAL_CLIENT_ASSISTANT_MODEL?.trim() || MISTRAL_EXTRACTION_MODEL;

export type ClientChatMessage = { role: "user" | "assistant"; content: string };

export type ClientAssistantAnswer = {
  reply: string;
  /** danger : risque immédiat (gaz, monoxyde, feu, eau sur l'électricité, effondrement). */
  urgency: "danger" | "urgent" | "normal";
  sheetIds: string[];
  /** Métier à contacter quand un professionnel est utile. */
  trade: { categoryId: string; tradeId: string; label: string } | null;
  /** Faut-il proposer la mise en relation maintenant ? */
  suggestPro: boolean;
  /** Description de la demande pour l'artisan, à partir de ce que le client a dit. */
  requestSummary: string | null;
};

const responseSchema = z.object({
  reply: z.string().min(1).max(2000),
  urgency: z.enum(["danger", "urgent", "normal"]).catch("normal"),
  sheet_ids: z.array(z.string()).max(6).catch([]),
  trade_category: z.string().nullable().optional(),
  trade: z.string().nullable().optional(),
  suggest_pro: z.boolean().catch(false),
  request_summary: z.string().max(1200).nullable().optional(),
});

const TRADES_LIST = TRADE_CATEGORIES.filter((c) => c.id !== "autre")
  .flatMap((c) => c.trades.map((t) => `${c.id}/${t.id} : ${t.label}`))
  .join("\n");

const SHEETS_LIST = CLIENT_SHEET_LIBRARY.map((s) => `${s.id} | ${s.title} | ${s.keywords.join(", ")}`).join("\n");

export const CLIENT_ASSISTANT_PROMPT = `Tu es Soline, l'assistante dépannage de SolineBTP pour les particuliers (pas des professionnels).
La personne décrit un souci dans son logement (panne, fuite, humidité, bruit, porte qui coince…). Vouvoie-la, sois chaleureuse, claire et brève (120 mots maximum, phrases courtes, listes à puces si utile).

Sécurité d'abord :
- Danger immédiat (odeur de gaz, détecteur de monoxyde, malaise, fumée, feu, eau sur une installation électrique, prise qui brûle, plafond ou mur qui menace de céder) : urgency = "danger". Commence par les gestes qui protègent et les numéros : 112 ou 18 (pompiers), Urgence Sécurité Gaz 0 800 47 33 33.
- Ne fais jamais faire à un particulier ce qui relève d'un professionnel : ouvrir le tableau électrique, une prise ou un interrupteur, toucher à des fils, intervenir sur un appareil ou une canalisation de gaz, ouvrir une chaudière, monter sur un toit, toucher à un mur porteur, poncer ou percer un matériau ancien pouvant contenir de l'amiante ou du plomb. Dans ces cas, explique seulement comment sécuriser et propose un professionnel.
- Seuls les petits gestes sans risque sont autorisés : couper l'eau ou le courant, réarmer un disjoncteur, déboucher, purger un radiateur, régler un flotteur, nettoyer, refaire un joint silicone…

Méthode :
- Si la situation n'est pas claire, pose une seule question précise (où, depuis quand, quel appareil…).
- Propose les fiches utiles du catalogue ci-dessous (identifiants exacts dans sheet_ids, 3 au maximum, aucune si rien ne correspond). Ne les recopie pas : résume l'essentiel et indique que la fiche détaille.
- Identifie le métier du professionnel adapté dans la liste ci-dessous (trade_category et trade exacts), dès que le sujet est clair.
- suggest_pro = true si un professionnel est nécessaire ou recommandé (danger, réparation hors petits gestes, problème qui persiste, ou demande explicite de la personne).
- request_summary : quand suggest_pro est true, rédige la demande telle que l'artisan la lira, à la première personne, avec uniquement les faits que la personne a écrits (2 à 4 phrases). N'ajoute jamais une action qu'elle n'a pas dit avoir faite (par exemple « j'ai coupé l'eau » si elle ne l'a pas écrit), ni un conseil, ni une hypothèse. Sinon null.
- Hors sujet (rien à voir avec le logement ou des travaux) : réponds poliment que tu aides pour les soucis du logement, sans fiche ni métier.
- N'avance jamais de prix.

Catalogue des fiches (identifiant | titre | mots-clés) :
${SHEETS_LIST}

Métiers (catégorie/métier : libellé) :
${TRADES_LIST}`;

const JSON_EXAMPLE = `{"reply":"…","urgency":"normal","sheet_ids":["…"],"trade_category":"…","trade":"…","suggest_pro":false,"request_summary":null}`;

/** Normalise la réponse de l'IA : identifiants et métier inconnus écartés. */
export function normalizeAssistantAnswer(raw: z.infer<typeof responseSchema>): ClientAssistantAnswer {
  const known = new Set(CLIENT_SHEET_LIBRARY.map((s) => s.id));
  const sheetIds = [...new Set(raw.sheet_ids.filter((id) => known.has(id)))].slice(0, 3);
  const categoryId = raw.trade_category?.trim() ?? "";
  const tradeId = raw.trade?.trim() ?? "";
  const category = TRADE_CATEGORIES.find((c) => c.id === categoryId);
  const trade =
    isValidTradeSelection(categoryId, tradeId) && category
      ? { categoryId, tradeId, label: category.trades.find((t) => t.id === tradeId)!.label }
      : null;
  const summary = raw.request_summary?.trim() || null;
  return {
    reply: raw.reply.trim(),
    urgency: raw.urgency,
    sheetIds,
    trade,
    suggestPro: raw.suggest_pro && !!trade,
    requestSummary: raw.suggest_pro ? summary : null,
  };
}

export async function askClientAssistant(messages: ClientChatMessage[]): Promise<ClientAssistantAnswer> {
  const history = messages
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }))
    .filter((m) => m.content.trim());
  const raw = await mistralChatParse(
    responseSchema,
    [{ role: "system", content: CLIENT_ASSISTANT_PROMPT }, ...history],
    "client_assistant",
    {
      model: CLIENT_ASSISTANT_MODEL,
      jsonExample: JSON_EXAMPLE,
      temperature: 0.2,
      maxTokens: 900,
      timeoutMs: 25_000,
      feature: "client_assistant",
    },
  );
  return normalizeAssistantAnswer(raw);
}
