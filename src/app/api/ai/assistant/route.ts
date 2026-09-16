import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import {
  looksLikeAppointmentCreation,
  tryConfirmNavigate,
  tryFastNavigate,
  tryRdvDataQuestion,
  looksLikeQuoteRequest,
} from "@/lib/ai/assistant-fast-path";
import { tryConversationContextQuote } from "@/lib/ai/assistant-conversation-quote";
import {
  processQuoteIntakeTurn,
  extractCustomerHintFromMessage,
  hasEnoughWorkForQuoteBuild,
  looksLikeExplicitNewQuoteRequest,
  looksLikeQuoteForPageContext,
  looksLikeRejectPageContextCustomer,
  looksLikeVagueQuoteRequest,
  shouldStartQuoteIntake,
  type QuoteIntakeState,
} from "@/lib/ai/assistant-quote-intake";
import {
  ASSISTANT_INTENT_JSON_SCHEMA,
  AssistantIntentSchema,
  type AssistantApiResponse,
} from "@/lib/ai/assistant-schema";
import {
  buildAppointmentsAnswer,
  countPendingInvoices,
  countPendingQuotes,
  fetchAppointmentsForDates,
} from "@/lib/ai/assistant-data-query";
import {
  answerMessageQuestion,
  tryOpenMessageNavigation,
} from "@/lib/ai/assistant-message-query";
import { buildQuoteFromText } from "@/lib/ai/build-quote-from-text";
import { extractFrenchDates } from "@/lib/ai/extract-dates";
import { extractFrenchTime } from "@/lib/ai/extract-time";
import { matchContactByQuery, type ContactCandidate } from "@/lib/ai/match-contact";
import { mistralChatParse } from "@/lib/ai/mistral";
import type { AiQuoteDraft } from "@/lib/ai/quote-draft-storage";
import { resolveAppointmentDate } from "@/lib/ai/resolve-appointment-when";
import { formatIsoDateFr, resolveFrenchDateQuery, toIsoDate } from "@/lib/ai/resolve-date";
import type { AssistantPageContextPayload } from "@/lib/ai/assistant-page-context";
import { buildAssistantPageContextBlock } from "@/lib/ai/assistant-page-enrichment";
import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { listArtisanContacts } from "@/lib/contacts/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_NAV = new Set([
  "/app",
  "/app/rdv",
  "/app/contacts",
  "/app/messages",
  "/app/quotes",
  "/app/quotes/new",
  "/app/invoices",
  "/app/reglages",
]);

const NAV_LABELS: Record<string, string> = {
  "/app": "Accueil",
  "/app/rdv": "Mes RDV",
  "/app/contacts": "Contacts",
  "/app/messages": "Messages",
  "/app/quotes": "Devis",
  "/app/quotes/new": "Nouveau devis",
  "/app/invoices": "Factures",
  "/app/reglages": "Réglages",
};

function mapMaterialsToDraftRows(
  data: Awaited<ReturnType<typeof buildQuoteFromText>>,
): AiQuoteDraft["supplierMaterials"] {
  return data.supplier_materials.map((row) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (row.match) {
      return {
        id,
        label: row.match.title,
        quantity: row.quantity,
        unitPriceEur: row.match.price_eur.toFixed(2).replace(".", ","),
        supplierProductId: row.match.id,
        supplierUrl: row.match.url,
        supplierSku: row.match.sku,
        excludeFromInvoice: true,
        similarity: row.match.similarity,
        requestedName: row.requested_name,
        specifications: row.specifications,
      };
    }
    return {
      id,
      label: row.requested_name,
      quantity: row.quantity,
      unitPriceEur: "",
      supplierProductId: null,
      supplierUrl: null,
      supplierSku: null,
      excludeFromInvoice: false,
      similarity: null,
      requestedName: row.requested_name,
      specifications: row.specifications,
    };
  });
}

function navigateResponse(href: string, label: string, reply: string): AssistantApiResponse {
  return {
    reply,
    intent: "navigate",
    action: { type: "navigate", href, label, auto: true },
    suggestions: [
      "Est-ce que j’ai des RDV demain ?",
      "Ouvre mes RDV de demain",
      "Crée un devis pour mon client…",
    ],
  };
}

function answerResponse(reply: string, href?: string | null, label?: string): AssistantApiResponse {
  return {
    reply,
    intent: "answer",
    action: href
      ? { type: "answer", href, label: label ?? "Voir dans l’app" }
      : { type: "answer" },
    suggestions: [
      "Ouvre mes RDV",
      "Combien de devis en attente ?",
      "Crée un devis pour mon client…",
    ],
  };
}

function buildRdvHref(dateQuery: string | null | undefined, message: string): { href: string; label: string } {
  const dates = extractFrenchDates(dateQuery ?? "");
  const iso = dates[0] ?? resolveFrenchDateQuery(dateQuery) ?? resolveFrenchDateQuery(message);
  if (iso) {
    return { href: `/app/rdv?date=${iso}`, label: `RDV · ${formatIsoDateFr(iso)}` };
  }
  return { href: "/app/rdv", label: "Mes RDV" };
}

function dayKeyLocalFromTs(isoOrTs: string): string {
  const d = new Date(isoOrTs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function answerRdvQuestion(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  artisanId: string,
  message: string,
): Promise<AssistantApiResponse | null> {
  const q = tryRdvDataQuestion(message);
  if (!q) return null;

  if (q.kind === "pending") {
    const rows = await fetchAppointmentsForDates(
      supabase,
      artisanId,
      // fenêtre large : 90 jours
      (() => {
        const out: string[] = [];
        const d = new Date();
        for (let i = 0; i < 90; i++) {
          out.push(toIsoDate(d));
          d.setDate(d.getDate() + 1);
        }
        return out;
      })(),
    );
    const pending = rows.filter((r) => r.status === "pending");
    if (!pending.length) {
      return answerResponse("Tu n’as aucun rendez-vous en attente de validation.", "/app/rdv", "Mes RDV");
    }
    const lines = pending.slice(0, 8).map((r) => {
      const day = formatIsoDateFr(r.start_time.slice(0, 10));
      const time = new Date(r.start_time).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `• ${day} ${time} · ${r.customer_name}`;
    });
    return answerResponse(
      `Tu as ${pending.length} RDV en attente :\n${lines.join("\n")}`,
      `/app/rdv?date=${dayKeyLocalFromTs(pending[0].start_time)}`,
      "Voir les RDV",
    );
  }

  let dates = q.dates;
  if (q.kind === "upcoming" && !dates.length) {
    const d = new Date();
    dates = [];
    for (let i = 0; i < 14; i++) {
      dates.push(toIsoDate(d));
      d.setDate(d.getDate() + 1);
    }
  }

  if (!dates.length) return null;

  const rows = await fetchAppointmentsForDates(supabase, artisanId, dates);
  // Pour « upcoming » sans date : ne garder que les jours avec RDV dans la réponse
  const relevantDates =
    q.kind === "upcoming"
      ? dates.filter((iso) => rows.some((r) => dayKeyLocalFromTs(r.start_time) === iso))
      : dates;

  if (q.kind === "upcoming" && !relevantDates.length) {
    return answerResponse(
      "Tu n’as aucun rendez-vous sur les 14 prochains jours.",
      "/app/rdv",
      "Mes RDV",
    );
  }

  const { reply, href } = buildAppointmentsAnswer(
    q.kind === "upcoming" ? relevantDates.slice(0, 7) : dates,
    rows,
  );
  return answerResponse(reply, href, "Voir dans le calendrier");
}

/**
 * Noms de clients utilisables pour préremplir un RDV : les contacts liés et les
 * invitations en attente, mais aussi les personnes déjà reçues en rendez-vous.
 * Sans ça, un client saisi à la main dans un RDV restait introuvable.
 */
async function buildAppointmentNamePool(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  artisanId: string,
  known: ContactCandidate[],
): Promise<ContactCandidate[]> {
  const pool = [...known];
  const seen = new Set(pool.map((c) => c.label.trim().toLowerCase()));

  const { data: past } = await supabase
    .from("appointments")
    .select("customer_name, customer_email, created_at")
    .eq("artisan_id", artisanId)
    .order("created_at", { ascending: false })
    .limit(200);

  for (const row of past ?? []) {
    const label = formatContactDisplayName({
      name: row.customer_name as string | null,
      email: row.customer_email as string | null,
    });
    if (label === "Client") continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push({
      customerUserId: "",
      label,
      email: (row.customer_email as string | null) ?? null,
      conversationId: null,
    });
  }

  return pool;
}

function parseQuoteIntakeFromBody(body: unknown): QuoteIntakeState | null {
  const raw =
    body && typeof body === "object" && "quoteIntake" in body
      ? (body as { quoteIntake?: unknown }).quoteIntake
      : null;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.active !== true) return null;
  if (o.step !== "client_kind" && o.step !== "client_detail" && o.step !== "work") return null;
  return raw as QuoteIntakeState;
}

async function buildQuoteDraftResponse(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  profile: {
    id: string;
    business_name: string | null;
    description: string | null;
    labor_rate_per_hour: number | null;
  },
  params: {
    instruction: string;
    customerLabel: string | null;
    matched: ReturnType<typeof matchContactByQuery>;
    customerEmail?: string | null;
    customerUserId?: string | null;
    reply?: string;
    extraWarnings?: string[];
  },
  suggestions: string[],
): Promise<AssistantApiResponse> {
  const { data: catalogServices } = await supabase
    .from("services")
    .select("id, title, duration, price")
    .eq("artisan_id", profile.id)
    .order("title", { ascending: true });

  const services = catalogServices ?? [];
  if (!services.length) {
    return navigateResponse(
      "/app/reglages",
      "Réglages",
      "Tu n’as pas encore de prestations. J’ouvre les réglages pour en ajouter.",
    );
  }

  const { instruction, customerLabel, matched, customerEmail, customerUserId, reply, extraWarnings } =
    params;

  let quoteData;
  try {
    quoteData = await buildQuoteFromText({
      supabase,
      instruction,
      profile,
      services,
      customerLabel,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[assistant] quote build", msg);
    if (msg.includes("401") || msg.toLowerCase().includes("unauthorized")) {
      throw new Error("ai_auth_failed");
    }
    if (msg === "empty_ai_response") {
      throw new Error("empty_ai_response");
    }
    throw new Error("ai_parse_failed");
  }

  const draftKey = randomUUID();
  const warnings = [...quoteData.warnings, ...(extraWarnings ?? [])];

  const resolvedName = customerLabel ?? matched?.contact.label ?? null;
  const resolvedEmail = matched?.contact.email ?? customerEmail ?? null;
  const resolvedUserId = matched?.contact.customerUserId ?? customerUserId ?? null;

  const draft: AiQuoteDraft = {
    version: 1,
    draftKey,
    conversationId: matched?.contact.conversationId ?? draftKey,
    generatedAt: new Date().toISOString(),
    matchedServiceIds: quoteData.matched_service_ids,
    laborDurationMinutes: quoteData.labor_duration_minutes,
    notes: quoteData.notes,
    supplierMaterials: mapMaterialsToDraftRows(quoteData),
    warnings,
    customerName: resolvedName,
    customerEmail: resolvedEmail,
    customerUserId: resolvedUserId || null,
  };

  const urlParams = new URLSearchParams({ aiDraft: "1", draftKey });
  if (resolvedUserId) {
    urlParams.set("customerUserId", resolvedUserId);
  } else if (matched?.contact.conversationId) {
    urlParams.set("conversationId", matched.contact.conversationId);
  }

  const serviceTitles = services
    .filter((s) => quoteData.matched_service_ids.includes(s.id))
    .map((s) => s.title);

  const laborHours =
    quoteData.labor_duration_minutes > 0
      ? Math.round((quoteData.labor_duration_minutes / 60) * 10) / 10
      : null;

  return {
    reply:
      reply?.replace(/\?\s*$/, "") ||
      `Brouillon prêt${resolvedName ? ` pour ${resolvedName}` : ""}. Ouvre le formulaire pour vérifier.`,
    intent: "create_quote_draft",
    quoteIntake: null,
    action: {
      type: "open_quote_form",
      draftKey,
      href: `/app/quotes/new?${urlParams.toString()}`,
      preview: {
        customerName: resolvedName,
        customerMatched: !!matched,
        serviceTitles,
        materialsCount: quoteData.supplier_materials.length,
        laborHours,
        notes: quoteData.notes,
        warnings,
      },
      draft,
    },
    suggestions,
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const message = String(body?.message ?? "").trim();
  const pendingAction =
    body?.pendingAction && typeof body.pendingAction === "object"
      ? (body.pendingAction as { type?: string; href?: string; label?: string })
      : null;

  const history = Array.isArray(body?.history)
    ? (body.history as { role?: string; content?: string }[])
        .slice(-10)
        .map((h) => {
          const role = h.role === "assistant" ? "Assistant" : "Artisan";
          const content = String(h.content ?? "").trim();
          return content ? `${role}: ${content}` : "";
        })
        .filter(Boolean)
    : [];

  const pageContext =
    body?.pageContext && typeof body.pageContext === "object"
      ? ({
          pathname: String(body.pageContext.pathname ?? ""),
          pageKey: String(body.pageContext.pageKey ?? ""),
          label: String(body.pageContext.label ?? ""),
          entityType: body.pageContext.entityType,
          entityId: body.pageContext.entityId ? String(body.pageContext.entityId) : undefined,
        } satisfies AssistantPageContextPayload)
      : null;

  if (!message) {
    return NextResponse.json({ error: "missing_message" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, business_name, description, labor_rate_per_hour")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id) return NextResponse.json({ error: "not_artisan" }, { status: 403 });

  // 1) Confirmation d’une navigation déjà proposée (« go », « vas-y »)
  if (pendingAction?.type === "navigate" && pendingAction.href) {
    const confirmed = tryConfirmNavigate(message, {
      href: pendingAction.href,
      label: pendingAction.label || "la page",
    });
    if (confirmed) {
      return NextResponse.json(
        navigateResponse(confirmed.href, confirmed.label, confirmed.reply),
      );
    }
  }

  const contactsRes = await listArtisanContacts();
  const linked: ContactCandidate[] = contactsRes.ok
    ? contactsRes.items
        .filter((i): i is Extract<typeof i, { kind: "linked" }> => i.kind === "linked")
        .filter((i) => !!i.conversationId || !!i.customerUserId)
        .map((i) => ({
          customerUserId: i.customerUserId ?? "",
          label: i.label,
          email: i.email,
          conversationId: i.conversationId,
        }))
    : [];

  const invited: ContactCandidate[] = contactsRes.ok
    ? contactsRes.items
        .filter((i): i is Extract<typeof i, { kind: "pending" }> => i.kind === "pending")
        .filter((i) => i.invitedName?.trim())
        .map((i) => ({
          customerUserId: "",
          label: i.invitedName!.trim(),
          email: i.email,
          conversationId: null,
        }))
    : [];

  // 2a) Ouvrir un fil / dernier message (ex. « ouvre le message de Dupont »)
  const openMessage = await tryOpenMessageNavigation(supabase, profile.id, user.id, message, linked);
  if (openMessage) {
    return NextResponse.json(navigateResponse(openMessage.href, openMessage.label, openMessage.reply));
  }

  // 2b) Questions messages (ex. « ai-je reçu un message de X le 14 sept ? »)
  const messageAnswer = await answerMessageQuestion(supabase, profile.id, user.id, message, linked);
  if (messageAnswer) {
    return NextResponse.json(
      answerResponse(messageAnswer.reply, messageAnswer.href, messageAnswer.label ?? undefined),
    );
  }

  // 2c) Questions données RDV (ex. « ai-je des RDV demain ? »)
  const rdvAnswer = await answerRdvQuestion(supabase, profile.id, message);
  if (rdvAnswer) return NextResponse.json(rdvAnswer);

  // Compteurs rapides devis / factures
  {
    const m = message.toLowerCase();
    if (/\b(devis).*(attente|envoy|pending)|combien.*(devis)/.test(m) && !looksLikeQuoteRequest(message)) {
      const n = await countPendingQuotes(supabase, profile.id);
      return NextResponse.json(
        answerResponse(
          n === 0
            ? "Tu n’as aucun devis en attente de réponse client."
            : `Tu as ${n} devis en attente de réponse client.`,
          "/app/quotes",
          "Voir les devis",
        ),
      );
    }
    if (/\b(facture|paiement).*(attente|envoy)|combien.*(facture)/.test(m)) {
      const n = await countPendingInvoices(supabase, profile.id);
      return NextResponse.json(
        answerResponse(
          n === 0
            ? "Tu n’as aucune facture en attente de paiement."
            : `Tu as ${n} facture${n > 1 ? "s" : ""} envoyée${n > 1 ? "s" : ""} en attente de paiement.`,
          "/app/invoices",
          "Voir les factures",
        ),
      );
    }
  }

  const defaultSuggestions = [
    "Crée un devis pour mon client…",
    "Ouvre mes RDV de demain",
    "Montre mes factures",
  ];

  // Devis depuis la conversation ouverte — seulement si demandé explicitement
  if (looksLikeQuoteForPageContext(message) && !looksLikeRejectPageContextCustomer(message)) {
    const contextQuote = await tryConversationContextQuote({
      supabase,
      profile,
      pageContext,
      message,
      suggestions: defaultSuggestions,
    });
    if (contextQuote) return NextResponse.json(contextQuote);
  }

  // Questionnaire devis guidé (client + qualification travaux, style widget)
  let activeIntake = parseQuoteIntakeFromBody(body);
  if (looksLikeRejectPageContextCustomer(message) || looksLikeExplicitNewQuoteRequest(message)) {
    activeIntake = null;
  }
  const shouldStartIntake = shouldStartQuoteIntake(message, !!activeIntake) && !activeIntake;

  if (shouldStartIntake || activeIntake) {
    try {
      const intakeResult = await processQuoteIntakeTurn({
        supabase,
        profile,
        linked,
        message,
        intake: activeIntake,
        startNew: shouldStartIntake,
      });

      if (intakeResult?.kind === "cancel") {
        return NextResponse.json({
          reply: "OK, j’annule la préparation du devis. Dis-moi si tu veux autre chose.",
          intent: "clarify",
          quoteIntake: null,
          suggestions: defaultSuggestions,
        } satisfies AssistantApiResponse);
      }

      if (intakeResult?.kind === "continue") {
        return NextResponse.json(intakeResult.response);
      }

      if (intakeResult?.kind === "build") {
        const instruction = [
          intakeResult.instruction,
          intakeResult.customerLabel ? `Client: ${intakeResult.customerLabel}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        const response = await buildQuoteDraftResponse(
          supabase,
          profile,
          {
            instruction,
            customerLabel: intakeResult.customerLabel,
            matched: intakeResult.matched,
            customerEmail: intakeResult.intake.customerEmail,
            customerUserId: intakeResult.intake.customerUserId,
            reply: `Brouillon prêt${intakeResult.customerLabel ? ` pour ${intakeResult.customerLabel}` : ""} — vérifie les lignes et le client.`,
          },
          defaultSuggestions,
        );
        return NextResponse.json(response);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[assistant] quote intake", msg);
      if (msg === "ai_auth_failed") {
        return NextResponse.json({ error: "ai_auth_failed" }, { status: 502 });
      }
      if (msg === "empty_ai_response") {
        return NextResponse.json({ error: "empty_ai_response" }, { status: 500 });
      }
      if (msg === "ai_parse_failed") {
        return NextResponse.json({ error: "ai_parse_failed" }, { status: 500 });
      }
      if (shouldStartIntake || activeIntake) {
        return NextResponse.json({ error: "ai_parse_failed" }, { status: 500 });
      }
    }
  }

  // 3) Fast-path navigation (sans LLM)
  const fast = tryFastNavigate(message);
  if (fast) {
    return NextResponse.json(navigateResponse(fast.href, fast.label, fast.reply));
  }

  const contactDirectory =
    linked.length > 0
      ? linked.map((c) => `- ${c.label}${c.email ? ` <${c.email}>` : ""}`).join("\n")
      : "(aucun client lié pour l’instant)";

  const pageContextBlock = await buildAssistantPageContextBlock(supabase, profile.id, pageContext);

  let intent;
  try {
    intent = await mistralChatParse(
      AssistantIntentSchema,
      [
        {
          role: "system",
          content: `Tu es Soline, assistant ULTRA-DIRECT pour un artisan.
Règles d’or :
1. AGIS tout de suite. Ne pose JAMAIS « prêt à y aller ? » ni « filtre par date ou client ? ».
2. Questions d’INFO (« ai-je des RDV… », « ai-je reçu un message… », « combien de devis… ») → intent=answer + answer_topic (appointments | messages | pending_quotes | pending_invoices) + date_query si dates citées. Le serveur lit la BDD.
3. « ouvre / va sur / affiche la page… » → intent=navigate (pas answer). « ouvre le message de X » → navigate vers /app/messages (le serveur résout le fil).
4. « go / vas-y / oui » après une nav → intent=navigate (historique).
5. create_quote_draft UNIQUEMENT si l’artisan décrit un chantier (work_description) OU cite un client dans son message (customer_query). Sans les deux : intent=clarify — ne devine JAMAIS le client depuis l’historique ou l’écran.
6. « crée / ajoute / planifie / cale un RDV pour X le … à … » → intent=create_appointment_draft, avec customer_query (le client), date_query (le jour) et time_query (l’heure). Ce n’est JAMAIS answer ni navigate.
7. clarify seulement si info bloquante pour un devis. Jamais pour une question RDV.
8. reply courte. Pour answer, une intro suffit (« Je regarde tes RDV… ») — le serveur complète.
9. date_query et time_query : recopie UNIQUEMENT les termes temporels du message actuel. Si le message n’indique aucun jour, date_query=null — le serveur reprendra le jour de l’historique. N’invente jamais de date.
10. Contexte écran : n’utilise le client affiché que si l’artisan le dit (« ce client », « suite à cette demande », « pour lui »). « Je veux un devis » ou « nouveau devis » sans précision → intent=clarify, customer_query=null, work_description=null.

Chemins navigate_path : /app, /app/rdv, /app/contacts, /app/messages, /app/quotes, /app/quotes/new, /app/invoices, /app/reglages.`,
        },
        {
          role: "user",
          content: `Contexte écran:
${pageContextBlock}

Clients connus:
${contactDirectory}

${history.length ? `Historique:\n${history.join("\n")}\n\n` : ""}Message actuel:
${message}`,
        },
      ],
      "assistant_intent",
      {
        temperature: 0.1,
        jsonSchema: ASSISTANT_INTENT_JSON_SCHEMA,
        jsonExample: `{
  "intent": "answer",
  "reply": "Je regarde tes rendez-vous.",
  "customer_query": null,
  "navigate_path": null,
  "date_query": null,
  "time_query": null,
  "work_description": null,
  "answer_topic": "appointments"
}`,
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[assistant] intent parse", msg);
    if (msg.includes("401") || msg.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "ai_auth_failed" }, { status: 502 });
    }
    return NextResponse.json({ error: "ai_parse_failed" }, { status: 500 });
  }

  if (!intent) {
    return NextResponse.json({ error: "empty_ai_response" }, { status: 500 });
  }

  const suggestions = defaultSuggestions;

  // Création de RDV : le formulaire s’ouvre prérempli, l’artisan enregistre lui-même.
  if (
    intent.intent === "create_appointment_draft" ||
    (looksLikeAppointmentCreation(message) && !looksLikeQuoteRequest(message))
  ) {
    const { dateIso, source: dateSource } = resolveAppointmentDate({
      message,
      intentDateQuery: intent.date_query,
      historyLines: history,
    });
    const time = extractFrenchTime(intent.time_query) ?? extractFrenchTime(message);

    if (!dateIso) {
      return NextResponse.json({
        reply: "Quel jour ? Ex. « Crée un RDV pour Dupont le 13 août à 11h ».",
        intent: "clarify" as const,
        suggestions,
      } satisfies AssistantApiResponse);
    }

    // Vivier large : le client d'un RDV n'est pas forcément un contact lié.
    const namePool = await buildAppointmentNamePool(supabase, profile.id, [...linked, ...invited]);
    const matched = intent.customer_query ? matchContactByQuery(intent.customer_query, namePool) : null;
    const customerName = matched?.contact.label ?? intent.customer_query?.trim() ?? null;

    const warnings: string[] = [];
    if (!customerName) warnings.push("Client non identifié — complète le nom.");
    else if (!matched) warnings.push(`« ${customerName} » n’est pas dans tes contacts — vérifie l’e-mail.`);
    if (!time) warnings.push("Aucune heure précisée — j’ai mis 9h00 par défaut.");
    if (dateSource === "history") {
      warnings.push("Jour repris de ta question précédente — corrige-le si besoin.");
    }

    const params = new URLSearchParams({
      new: "1",
      ai: "1",
      start: `${dateIso}T${time ?? "09:00"}`,
    });
    if (customerName) params.set("name", customerName);
    if (matched?.contact.email) params.set("email", matched.contact.email);

    const whenLabel = `${formatIsoDateFr(dateIso)} à ${(time ?? "09:00").replace(":", "h")}`;
    const dateOrigin = dateSource === "history" ? " (le jour dont on parlait)" : "";

    return NextResponse.json({
      reply: `RDV préparé${customerName ? ` pour ${customerName}` : ""} le ${whenLabel}${dateOrigin}. Vérifie et enregistre.`,
      intent: "create_appointment_draft",
      action: {
        type: "open_appointment_form",
        href: `/app/rdv?${params.toString()}`,
        preview: {
          customerName,
          customerMatched: !!matched,
          dateIso,
          time: time ?? "09:00",
          warnings,
        },
      },
      suggestions,
    } satisfies AssistantApiResponse);
  }

  // Garde-fou : si le modèle invente un devis alors que ce n’en est pas un
  if (intent.intent === "create_quote_draft" && !looksLikeQuoteRequest(message) && !intent.work_description) {
    const again = tryFastNavigate(message);
    if (again) {
      return NextResponse.json(navigateResponse(again.href, again.label, again.reply));
    }
    // Confirmation sans contexte devis → redemander clairement
    return NextResponse.json({
      reply: "Dis-moi juste ce que tu veux ouvrir (RDV, factures, devis…) ou décris le devis à préparer.",
      intent: "clarify" as const,
      suggestions,
    } satisfies AssistantApiResponse);
  }

  if (intent.intent === "help" || intent.intent === "clarify") {
    return NextResponse.json({
      reply: intent.reply,
      intent: intent.intent,
      suggestions,
    } satisfies AssistantApiResponse);
  }

  if (intent.intent === "answer") {
    const topic = intent.answer_topic ?? "appointments";
    if (topic === "pending_quotes") {
      const n = await countPendingQuotes(supabase, profile.id);
      return NextResponse.json(
        answerResponse(
          n === 0
            ? "Tu n’as aucun devis en attente de réponse client."
            : `Tu as ${n} devis en attente de réponse client.`,
          "/app/quotes",
          "Voir les devis",
        ),
      );
    }
    if (topic === "pending_invoices") {
      const n = await countPendingInvoices(supabase, profile.id);
      return NextResponse.json(
        answerResponse(
          n === 0
            ? "Tu n’as aucune facture en attente de paiement."
            : `Tu as ${n} facture${n > 1 ? "s" : ""} en attente de paiement.`,
          "/app/invoices",
          "Voir les factures",
        ),
      );
    }

    if (topic === "messages") {
      const msg = await answerMessageQuestion(supabase, profile.id, user.id, message, linked);
      if (msg) {
        return NextResponse.json(answerResponse(msg.reply, msg.href, msg.label ?? undefined));
      }
      return NextResponse.json(
        answerResponse("Je n’ai pas trouvé de message correspondant.", "/app/messages", "Messages"),
      );
    }

    // appointments (défaut)
    const fromIntent = extractFrenchDates(intent.date_query ?? "");
    const dateList = fromIntent.length ? fromIntent : extractFrenchDates(message);
    if (!dateList.length) {
      const fallback = await answerRdvQuestion(supabase, profile.id, message);
      if (fallback) return NextResponse.json(fallback);
      return NextResponse.json(
        answerResponse(
          "Dis-moi quels jours vérifier. Ex. « Est-ce que j’ai des RDV demain ? »",
        ),
      );
    }
    const rows = await fetchAppointmentsForDates(supabase, profile.id, dateList);
    const { reply, href } = buildAppointmentsAnswer(dateList, rows);
    return NextResponse.json(answerResponse(reply, href, "Voir dans le calendrier"));
  }

  if (intent.intent === "navigate") {
    const path =
      intent.navigate_path && ALLOWED_NAV.has(intent.navigate_path) ? intent.navigate_path : "/app";
    let label = NAV_LABELS[path] ?? "Ouvrir";
    let href = path;

    if (path === "/app/rdv") {
      const rdv = buildRdvHref(intent.date_query, message);
      href = rdv.href;
      label = rdv.label;
    }

    const reply =
      intent.reply && !/[?？]\s*$/.test(intent.reply)
        ? intent.reply
        : `J’ouvre ${label}.`;

    return NextResponse.json(navigateResponse(href, label, reply));
  }

  // create_quote_draft — jamais sans qualification ; ne pas réutiliser le client du contexte sans consentement
  const customerFromMessage = extractCustomerHintFromMessage(message);
  const usePageContextCustomer =
    looksLikeQuoteForPageContext(message) && !looksLikeRejectPageContextCustomer(message);

  let customerQuery = intent.customer_query;
  if (!customerFromMessage && !usePageContextCustomer) {
    customerQuery = null;
  } else if (customerFromMessage) {
    customerQuery = customerFromMessage;
  }

  const needsIntake =
    shouldStartQuoteIntake(message, false) ||
    (!hasEnoughWorkForQuoteBuild(message, intent.work_description) &&
      !usePageContextCustomer &&
      looksLikeQuoteRequest(message));

  if (needsIntake) {
    const intakeResult = await processQuoteIntakeTurn({
      supabase,
      profile,
      linked,
      message,
      intake: null,
      startNew: true,
    });
    if (intakeResult?.kind === "continue") {
      return NextResponse.json(intakeResult.response);
    }
    if (intakeResult?.kind === "build") {
      const instruction = [
        intakeResult.instruction,
        intakeResult.customerLabel ? `Client: ${intakeResult.customerLabel}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      const response = await buildQuoteDraftResponse(
        supabase,
        profile,
        {
          instruction,
          customerLabel: intakeResult.customerLabel,
          matched: intakeResult.matched,
          customerEmail: intakeResult.intake.customerEmail,
          customerUserId: intakeResult.intake.customerUserId,
          reply: `Brouillon prêt${intakeResult.customerLabel ? ` pour ${intakeResult.customerLabel}` : ""} — vérifie les lignes et le client.`,
        },
        suggestions,
      );
      return NextResponse.json(response);
    }
  }

  const matched = customerQuery ? matchContactByQuery(customerQuery, linked) : null;
  const customerLabel = matched?.contact.label ?? customerQuery ?? null;

  const instruction = [
    intent.work_description?.trim() || message,
    customerLabel ? `Client: ${customerLabel}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const extraWarnings: string[] = [];
  if (customerQuery && !matched) {
    extraWarnings.push(
      `Client « ${customerQuery} » non trouvé dans tes contacts — le nom est prérempli, vérifie-le.`,
    );
  }

  try {
    const response = await buildQuoteDraftResponse(
      supabase,
      profile,
      {
        instruction,
        customerLabel,
        matched,
        reply: intent.reply,
        extraWarnings,
      },
      suggestions,
    );
    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "ai_auth_failed") {
      return NextResponse.json({ error: "ai_auth_failed" }, { status: 502 });
    }
    if (msg === "empty_ai_response") {
      return NextResponse.json({ error: "empty_ai_response" }, { status: 500 });
    }
    return NextResponse.json({ error: "ai_parse_failed" }, { status: 500 });
  }
}
