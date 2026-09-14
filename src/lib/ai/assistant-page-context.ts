import {
  QUOTE_NEW_PLACEHOLDER,
  QUOTE_NEW_STARTERS,
  QUOTE_NEW_WELCOME,
} from "@/lib/ai/assistant-quote-context";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AssistantEntityType = "quote" | "invoice" | "contact" | "conversation" | "project";

/** Contexte de page envoyé au serveur avec chaque message. */
export type AssistantPageContextPayload = {
  pathname: string;
  pageKey: string;
  label: string;
  entityType?: AssistantEntityType;
  entityId?: string;
};

export type AssistantPageContext = AssistantPageContextPayload & {
  welcome: string;
  /** 1 à 2 actions suggérées selon la page. */
  suggestions: string[];
  inputPlaceholder: string;
};

function segmentAfter(prefix: string, pathname: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const id = rest.split("/")[0]?.split("?")[0] ?? "";
  return UUID_RE.test(id) ? id : null;
}

function pickTwo(...items: string[]): string[] {
  return items.filter(Boolean).slice(0, 2);
}

export function resolveAssistantPageContext(pathname: string): AssistantPageContext {
  const base = { pathname };

  if (pathname === "/app/quotes/new") {
    return {
      ...base,
      pageKey: "quotes-new",
      label: "Nouveau devis",
      welcome: QUOTE_NEW_WELCOME,
      suggestions: pickTwo(...QUOTE_NEW_STARTERS),
      inputPlaceholder: QUOTE_NEW_PLACEHOLDER,
    };
  }

  const quoteId = segmentAfter("/app/quotes/", pathname);
  if (quoteId) {
    return {
      ...base,
      pageKey: `quote-${quoteId}`,
      label: "Fiche devis",
      entityType: "quote",
      entityId: quoteId,
      welcome: "Tu consultes un devis. Je peux le résumer, t’aider à le modifier ou préparer la facture.",
      suggestions: pickTwo("Résume ce devis", "Créer la facture pour ce devis"),
      inputPlaceholder: "Ex. : résume ce devis ou crée la facture…",
    };
  }

  if (pathname === "/app/quotes") {
    return {
      ...base,
      pageKey: "quotes-list",
      label: "Liste des devis",
      welcome: "Tu es sur tes devis. Dis-moi ce que tu cherches ou ce que tu veux créer.",
      suggestions: pickTwo("Combien de devis en attente ?", "Crée un devis pour mon client…"),
      inputPlaceholder: "Ex. : combien de devis en attente ?",
    };
  }

  const invoiceId = segmentAfter("/app/invoices/", pathname);
  if (invoiceId) {
    return {
      ...base,
      pageKey: `invoice-${invoiceId}`,
      label: "Fiche facture",
      entityType: "invoice",
      entityId: invoiceId,
      welcome: "Tu consultes une facture. Je peux la résumer ou t’aider sur le suivi client.",
      suggestions: pickTwo("Résume cette facture", "Relancer le client pour cette facture"),
      inputPlaceholder: "Ex. : résume cette facture…",
    };
  }

  if (pathname === "/app/invoices") {
    return {
      ...base,
      pageKey: "invoices-list",
      label: "Liste des factures",
      welcome: "Tu es sur tes factures. Je peux te donner un état des paiements ou ouvrir un dossier.",
      suggestions: pickTwo("Combien de factures impayées ?", "Montre les factures en attente"),
      inputPlaceholder: "Ex. : combien de factures impayées ?",
    };
  }

  const contactId = segmentAfter("/app/contacts/", pathname);
  if (contactId) {
    return {
      ...base,
      pageKey: `contact-${contactId}`,
      label: "Fiche client",
      entityType: "contact",
      entityId: contactId,
      welcome: "Tu consultes un client. Je peux préparer un devis ou un RDV pour lui.",
      suggestions: pickTwo("Créer un devis pour ce client", "Planifier un RDV pour ce client"),
      inputPlaceholder: "Ex. : crée un devis pour ce client…",
    };
  }

  if (pathname === "/app/contacts") {
    return {
      ...base,
      pageKey: "contacts-list",
      label: "Contacts",
      welcome: "Tu es sur tes contacts. Je peux t’aider à retrouver un client ou en ajouter un.",
      suggestions: pickTwo("Crée un devis pour mon client…", "Combien de clients liés ?"),
      inputPlaceholder: "Ex. : devis pour Dupont…",
    };
  }

  const conversationId = segmentAfter("/app/messages/", pathname);
  if (conversationId) {
    return {
      ...base,
      pageKey: `conversation-${conversationId}`,
      label: "Conversation client",
      entityType: "conversation",
      entityId: conversationId,
      welcome: "Tu es dans une conversation client. Je peux t’aider à répondre ou préparer un devis.",
      suggestions: pickTwo("Aide-moi à répondre au client", "Créer un devis suite à cette demande"),
      inputPlaceholder: "Ex. : propose une réponse au client…",
    };
  }

  if (pathname === "/app/messages") {
    return {
      ...base,
      pageKey: "messages-list",
      label: "Messages",
      welcome: "Tu es sur ta messagerie. Dis-moi si tu veux ouvrir une conversation ou répondre.",
      suggestions: pickTwo("Ouvre mes messages", "Crée un devis pour un client…"),
      inputPlaceholder: "Ex. : ouvre la conversation avec…",
    };
  }

  if (pathname === "/app/rdv" || pathname.startsWith("/app/rdv?")) {
    return {
      ...base,
      pageKey: "rdv",
      label: "Agenda",
      welcome: "Tu es sur ton agenda. Je peux vérifier tes créneaux ou planifier un RDV.",
      suggestions: pickTwo("Ai-je des RDV demain ?", "Crée un RDV pour un client…"),
      inputPlaceholder: "Ex. : RDV demain ?",
    };
  }

  const projectId = segmentAfter("/app/chantiers/", pathname);
  if (projectId) {
    return {
      ...base,
      pageKey: `project-${projectId}`,
      label: "Fiche chantier",
      entityType: "project",
      entityId: projectId,
      welcome: "Tu consultes un chantier. Je peux t’aider à préparer un devis ou un suivi.",
      suggestions: pickTwo("Créer un devis pour ce chantier", "Résume l’avancement de ce chantier"),
      inputPlaceholder: "Ex. : devis pour ce chantier…",
    };
  }

  if (pathname === "/app/chantiers") {
    return {
      ...base,
      pageKey: "projects-list",
      label: "Chantiers",
      welcome: "Tu es sur tes chantiers. Dis-moi ce que tu veux consulter ou créer.",
      suggestions: pickTwo("Ouvre mes chantiers", "Crée un devis pour un chantier…"),
      inputPlaceholder: "Ex. : ouvre mes chantiers…",
    };
  }

  if (pathname === "/app") {
    return {
      ...base,
      pageKey: "dashboard",
      label: "Tableau de bord",
      welcome: "Tu es sur ton tableau de bord. Que veux-tu faire en priorité aujourd’hui ?",
      suggestions: pickTwo("Combien de devis en attente ?", "Ai-je des RDV cette semaine ?"),
      inputPlaceholder: "Ex. : combien de devis en attente ?",
    };
  }

  if (pathname.startsWith("/app/reglages")) {
    return {
      ...base,
      pageKey: "settings",
      label: "Réglages",
      welcome: "Tu es dans les réglages. Je peux t’indiquer où modifier ton activité, tes prestations ou ta vitrine.",
      suggestions: pickTwo("Où modifier mes prestations ?", "Comment changer mon logo vitrine ?"),
      inputPlaceholder: "Ex. : où modifier mes prestations ?",
    };
  }

  if (pathname === "/app/ouvrages") {
    return {
      ...base,
      pageKey: "catalog",
      label: "Ouvrages",
      welcome: "Tu es sur ton catalogue d’ouvrages. Je peux t’aider à retrouver une prestation ou préparer un devis.",
      suggestions: pickTwo("Crée un devis pour mon client…", "Ouvre mes devis"),
      inputPlaceholder: "Ex. : devis avec pose carrelage…",
    };
  }

  if (pathname === "/app/appels") {
    return {
      ...base,
      pageKey: "calls",
      label: "Appels Soline",
      welcome: "Tu es sur tes appels Soline. Je peux t’aider à relancer un lead ou créer un devis.",
      suggestions: pickTwo("Crée un devis pour mon client…", "Ouvre mes devis"),
      inputPlaceholder: "Ex. : devis pour le dernier appel…",
    };
  }

  return {
    ...base,
    pageKey: pathname.replace(/\//g, "-") || "app",
    label: "Espace pro",
    welcome:
      "Pose-moi une question ou une action. Ex. « Ai-je des RDV demain ? » ou « Crée un devis pour Dupont ».",
    suggestions: pickTwo("Crée un devis pour mon client…", "Ouvre mes rendez-vous"),
    inputPlaceholder: "Écris ou dicte ta demande…",
  };
}

export function toAssistantPageContextPayload(ctx: AssistantPageContext): AssistantPageContextPayload {
  const { pathname, pageKey, label, entityType, entityId } = ctx;
  return { pathname, pageKey, label, entityType, entityId };
}
