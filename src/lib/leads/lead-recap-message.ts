import type { LeadQualification } from "@/lib/ai/qualify-lead-schema";
import { findTrade, findTradeCategory } from "@/lib/trades/taxonomy";

export type LeadRecapInput = {
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  description: string;
  addressLabel: string | null;
  tradeCategory: string | null;
  trade: string | null;
  estimateMin: number | null;
  estimateMax: number | null;
  qualification: LeadQualification | null;
  mediaCount: number;
};

/** Premier message dans la messagerie artisan : récapitulatif structuré du lead. */
export function buildLeadRecapMessage(input: LeadRecapInput): string {
  const lines: string[] = [
    "📋 Demande qualifiée reçue via Orbit Artisan",
    "",
    `Contact : ${input.contactName}`,
  ];

  if (input.contactEmail) lines.push(`E-mail : ${input.contactEmail}`);
  if (input.contactPhone) lines.push(`Téléphone : ${input.contactPhone}`);

  const category = findTradeCategory(input.tradeCategory);
  const trade = findTrade(input.tradeCategory, input.trade);
  const tradeLabel = [category?.label, trade?.label].filter(Boolean).join(" · ");
  if (tradeLabel) lines.push(`Métier : ${tradeLabel}`);
  if (input.addressLabel) lines.push(`Lieu : ${input.addressLabel}`);

  if (input.estimateMin != null && input.estimateMax != null) {
    lines.push(
      "",
      `Estimation indicative (non engageante) : ${input.estimateMin.toLocaleString("fr-FR")} – ${input.estimateMax.toLocaleString("fr-FR")} €`,
    );
  }

  lines.push("", "— Besoin —", input.description.trim());

  const q = input.qualification;
  if (q?.need_summary && q.need_summary !== input.description.trim()) {
    lines.push("", "— Synthèse IA —", q.need_summary);
  }
  if (q?.technical_elements?.length) {
    lines.push("", "— Points techniques —", ...q.technical_elements.map((t) => `• ${t}`));
  }
  if (q?.urgency) {
    const urgencyLabel =
      q.urgency === "urgent"
        ? "Urgent"
        : q.urgency === "cette_semaine"
          ? "Cette semaine"
          : "Flexible";
    lines.push("", `Urgence : ${urgencyLabel}`);
  }
  if (input.mediaCount > 0) {
    lines.push("", `${input.mediaCount} photo(s) ou vidéo(s) jointe(s) ci-dessous.`);
  }

  lines.push(
    "",
    "—",
    "Fourchette indicative uniquement. Confirme après visite ou diagnostic avant d'envoyer un devis ferme.",
  );

  return lines.join("\n").slice(0, 8000);
}
