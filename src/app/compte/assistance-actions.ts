"use server";

import { finalizeLead, saveLeadBrief, startLead, submitLeadContact } from "@/app/estimation/actions";
import { askClientAssistant, type ClientAssistantAnswer, type ClientChatMessage } from "@/lib/client-space/client-assistant";
import { loadCustomerContactDetails, requireCustomer } from "@/lib/client-space/require-customer";
import { CLIENT_SHEET_LIBRARY, getClientSheet } from "@/lib/technical-sheets/client/library";
import type { ClientSheetLevel } from "@/lib/technical-sheets/client/types";
import type { LeadEstimate, MatchedArtisan } from "@/lib/leads/types";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { smartSearchSheets, type SmartSearchMatch } from "@/lib/technical-sheets/smart-search";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { isValidTradeSelection } from "@/lib/trades/taxonomy";

/** Recherche qui comprend la demande, dans les fiches dépannage des particuliers. */
export async function searchClientSheetsAction(
  rawQuery: string,
): Promise<{ ok: true; matches: SmartSearchMatch[] } | { ok: false; error: "auth" | "rate_limited" | "failed" }> {
  const query = String(rawQuery ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (query.length < 3) return { ok: true, matches: [] };
  const auth = await requireCustomer();
  if (!auth.ok) return { ok: false, error: "auth" };
  if (!(await consumeRateLimit(RATE_LIMITS.technicalSheetSearch, `customer:${auth.customer.userId}`))) {
    return { ok: false, error: "rate_limited" };
  }
  try {
    return { ok: true, matches: await smartSearchSheets(query, CLIENT_SHEET_LIBRARY, "particulier") };
  } catch (error) {
    console.error("[client-space] sheet search", error instanceof Error ? error.message : error);
    return { ok: false, error: "failed" };
  }
}

export type ConnectionInput = {
  description: string;
  categoryId: string;
  tradeId: string;
  firstName: string;
  lastName: string;
  phone: string;
  addressLabel: string;
  lat: number;
  lng: number;
  /** Garder téléphone et adresse pour les prochaines demandes. */
  remember: boolean;
};

export type ConnectionResult =
  | {
      ok: true;
      artisans: Pick<MatchedArtisan, "id" | "businessName" | "slug" | "distanceKm" | "city" | "logoUrl">[];
      estimate: LeadEstimate | null;
      /** Aucun artisan inscrit : les artisans de la zone sont sollicités par l'équipe. */
      concierge: boolean;
    }
  | { ok: false; error: string; message: string };

const CONNECTION_ERRORS: Record<string, string> = {
  auth: "Connectez-vous pour envoyer votre demande.",
  not_customer: "La mise en relation est réservée aux comptes clients.",
  invalid_description: "Décrivez votre problème en quelques mots (au moins 10 caractères).",
  invalid_trade: "Choisissez le métier du professionnel recherché.",
  invalid_address: "Indiquez l'adresse de l'intervention.",
  invalid_phone: "Indiquez un numéro de téléphone valide, pour que l'artisan puisse vous rappeler.",
  invalid_first_name: "Indiquez votre prénom.",
  invalid_last_name: "Indiquez votre nom.",
  rate_limited: "Vous avez envoyé beaucoup de demandes aujourd'hui. Réessayez demain ou écrivez directement à un artisan.",
};

function failure(error: string): ConnectionResult {
  return { ok: false, error, message: CONNECTION_ERRORS[error] ?? "La demande n'a pas pu être envoyée. Réessayez dans un instant." };
}

/**
 * Mise en relation depuis l'espace client (fiche dépannage ou assistant) : même circuit
 * que l'estimation publique (qualification IA, 3 artisans du métier à 40 km, message
 * récapitulatif et brouillon de devis chez l'artisan), rattaché au compte du client.
 */
export async function requestArtisanConnection(input: ConnectionInput): Promise<ConnectionResult> {
  const auth = await requireCustomer();
  if (!auth.ok) return failure(auth.error);
  const { customer } = auth;

  const description = String(input.description ?? "").trim().slice(0, 2000);
  const phone = String(input.phone ?? "").replace(/[^\d+ ]/g, "").trim();
  const addressLabel = String(input.addressLabel ?? "").trim().slice(0, 300);
  if (description.length < 10) return failure("invalid_description");
  if (!isValidTradeSelection(input.categoryId, input.tradeId)) return failure("invalid_trade");
  if (!addressLabel || !Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return failure("invalid_address");
  if (phone.replace(/\D/g, "").length < 9) return failure("invalid_phone");
  if (!(await consumeRateLimit(RATE_LIMITS.clientConnection, `customer:${customer.userId}`))) return failure("rate_limited");

  const started = await startLead({ categoryId: input.categoryId, tradeId: input.tradeId });
  if (!started.ok) return failure(started.error);
  const { token, leadId } = started.session;

  // Origine et rattachement au compte : la demande apparaît dans « Mes demandes ».
  const admin = createSupabaseServiceRoleClient();
  if (admin) {
    const claim = await admin.from("leads").update({ claimed_by_user_id: customer.userId }).eq("id", leadId);
    if (claim.error) console.error("[client-space] lead claim", claim.error.message);
    // Origine « client_space » : valeur ajoutée par la migration 77.
    const origin = await admin.from("leads").update({ source: "client_space" }).eq("id", leadId);
    if (origin.error) console.error("[client-space] lead origin", origin.error.message);
  }

  const brief = await saveLeadBrief({
    token,
    description,
    categoryId: input.categoryId,
    tradeId: input.tradeId,
    lat: input.lat,
    lng: input.lng,
    addressLabel,
  });
  if (!brief.ok) return failure(brief.error);

  const finalized = await finalizeLead({
    token,
    categoryId: input.categoryId,
    tradeId: input.tradeId,
    description,
    mediaCount: 0,
    lat: input.lat,
    lng: input.lng,
    addressLabel,
  });
  if (!finalized.ok) return failure(finalized.error);

  const contact = await submitLeadContact({
    token,
    firstName: input.firstName,
    lastName: input.lastName,
    email: customer.email,
    phone,
    mode: "general",
  });
  if (!contact.ok) return failure(contact.error);

  if (input.remember) {
    const { error } = await customer.supabase.from("customer_contact_details").upsert({
      user_id: customer.userId,
      phone,
      address_label: addressLabel,
      address_lat: input.lat,
      address_lng: input.lng,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error("[client-space] contact details", error.message);
  }

  return {
    ok: true,
    artisans: finalized.artisans.map((a) => ({
      id: a.id,
      businessName: a.businessName,
      slug: a.slug,
      distanceKm: a.distanceKm,
      city: a.city,
      logoUrl: a.logoUrl,
    })),
    estimate: finalized.estimate.min > 0 ? finalized.estimate : null,
    concierge: finalized.artisans.length === 0 || contact.warning === "concierge" || contact.warning === "no_artisans",
  };
}

/** Coordonnées déjà connues, pour préremplir le formulaire de mise en relation. */
export async function loadConnectionDefaultsAction(): Promise<{
  firstName: string;
  lastName: string;
  phone: string;
  addressLabel: string;
  lat: number | null;
  lng: number | null;
} | null> {
  const auth = await requireCustomer();
  if (!auth.ok) return null;
  const details = await loadCustomerContactDetails(auth.customer.supabase, auth.customer.userId);
  const [firstName = "", ...rest] = auth.customer.displayName.split(/\s+/).filter(Boolean);
  return {
    firstName,
    lastName: rest.join(" "),
    phone: details.phone ?? "",
    addressLabel: details.addressLabel ?? "",
    lat: details.lat,
    lng: details.lng,
  };
}

export type AssistantSheetCard = { id: string; title: string; summary: string; level: ClientSheetLevel };

export type ClientAssistantActionResult =
  | { ok: true; answer: ClientAssistantAnswer; sheets: AssistantSheetCard[] }
  | { ok: false; message: string };

/** Un tour de conversation avec l'assistant dépannage (historique tenu par le navigateur). */
export async function askClientAssistantAction(rawMessages: ClientChatMessage[]): Promise<ClientAssistantActionResult> {
  const messages = (Array.isArray(rawMessages) ? rawMessages : [])
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 1500) }))
    .filter((m) => m.content)
    .slice(-12);
  if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
    return { ok: false, message: "Décrivez votre souci en quelques mots." };
  }

  const auth = await requireCustomer();
  if (!auth.ok) return { ok: false, message: "Connectez-vous pour utiliser l'assistant." };
  if (!(await consumeRateLimit(RATE_LIMITS.clientAssistant, `customer:${auth.customer.userId}`))) {
    return { ok: false, message: "Beaucoup de messages en peu de temps : réessayez dans quelques minutes. En cas de danger, appelez le 112." };
  }

  try {
    const answer = await askClientAssistant(messages);
    const sheets = answer.sheetIds.flatMap((id) => {
      const sheet = getClientSheet(id);
      return sheet ? [{ id: sheet.id, title: sheet.title, summary: sheet.summary, level: sheet.level }] : [];
    });
    return { ok: true, answer, sheets };
  } catch (error) {
    console.error("[client-space] assistant", error instanceof Error ? error.message : error);
    return {
      ok: false,
      message: "L'assistant ne répond pas pour le moment. En cas de danger (gaz, fumée, eau sur l'électricité), appelez le 112.",
    };
  }
}
