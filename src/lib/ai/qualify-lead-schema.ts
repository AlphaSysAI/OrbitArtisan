import { z } from "zod";

/** Analyse structurée d'une demande de particulier, en vue d'un chiffrage. */

export const LEAD_URGENCIES = ["urgent", "cette_semaine", "flexible"] as const;
export const LEAD_COMPLEXITIES = ["simple", "moyenne", "elevee"] as const;
export const LEAD_CONFIDENCES = ["faible", "moyenne", "bonne"] as const;

export type LeadUrgency = (typeof LEAD_URGENCIES)[number];
export type LeadComplexity = (typeof LEAD_COMPLEXITIES)[number];
export type LeadConfidence = (typeof LEAD_CONFIDENCES)[number];

function coerceText(max: number) {
  return (v: unknown) => String(v ?? "").trim().slice(0, max);
}

/** Les petits modèles renvoient parfois une chaîne, un nombre ou du bruit. */
function coerceEnum<T extends readonly string[]>(allowed: T, fallback: T[number]) {
  return (v: unknown): T[number] => {
    const raw = String(v ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[\s-]+/g, "_");
    const hit = allowed.find((a) => a === raw);
    return hit ?? fallback;
  };
}

function coerceHours(fallback: number) {
  return (v: unknown) => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return fallback;
    // Au-delà d'un mois de chantier, l'estimation automatique n'a plus de sens.
    return Math.min(n, 320);
  };
}

function coerceShare(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0.3;
  // Certains modèles répondent en pourcentage.
  const share = n > 1 ? n / 100 : n;
  return Math.min(0.7, Math.max(0, share));
}

function coerceList(max: number) {
  return (v: unknown) => {
    const raw = Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : [];
    return raw
      .map((item) => String(item ?? "").trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, max);
  };
}

export const LeadQualificationSchema = z.object({
  need_summary: z.preprocess(coerceText(400), z.string()),
  job_type: z.preprocess(coerceText(80), z.string()),
  urgency: z.preprocess(coerceEnum(LEAD_URGENCIES, "flexible"), z.enum(LEAD_URGENCIES)),
  technical_elements: z.preprocess(coerceList(6), z.array(z.string())),
  estimated_hours_min: z.preprocess(coerceHours(2), z.number()),
  estimated_hours_max: z.preprocess(coerceHours(6), z.number()),
  complexity: z.preprocess(coerceEnum(LEAD_COMPLEXITIES, "moyenne"), z.enum(LEAD_COMPLEXITIES)),
  /** Part des matériaux dans le total, entre 0 et 0,7. */
  material_cost_share: z.preprocess(coerceShare, z.number()),
  confidence: z.preprocess(coerceEnum(LEAD_CONFIDENCES, "moyenne"), z.enum(LEAD_CONFIDENCES)),
  /** Ce qu'il manque encore pour chiffrer sérieusement. */
  missing_info: z.preprocess(coerceList(4), z.array(z.string())),
});

export type LeadQualification = z.infer<typeof LeadQualificationSchema>;

export const LEAD_QUALIFICATION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    need_summary: { type: "string", description: "Le besoin reformulé en 1 à 3 phrases." },
    job_type: { type: "string", description: "Nature des travaux en 2 à 5 mots." },
    urgency: { type: "string", enum: [...LEAD_URGENCIES] },
    technical_elements: {
      type: "array",
      items: { type: "string" },
      description: "Éléments techniques utiles au chiffrage, tirés du texte uniquement.",
    },
    estimated_hours_min: { type: "number", description: "Heures de main d'œuvre, borne basse." },
    estimated_hours_max: { type: "number", description: "Heures de main d'œuvre, borne haute." },
    complexity: { type: "string", enum: [...LEAD_COMPLEXITIES] },
    material_cost_share: {
      type: "number",
      description: "Part des matériaux dans le coût total, entre 0 et 0.7.",
    },
    confidence: { type: "string", enum: [...LEAD_CONFIDENCES] },
    missing_info: {
      type: "array",
      items: { type: "string" },
      description: "Informations manquantes pour un chiffrage fiable.",
    },
  },
  required: [
    "need_summary",
    "job_type",
    "urgency",
    "technical_elements",
    "estimated_hours_min",
    "estimated_hours_max",
    "complexity",
    "material_cost_share",
    "confidence",
    "missing_info",
  ],
};

export const LEAD_QUALIFICATION_JSON_EXAMPLE = `{
  "need_summary": "Je dois faire réparer une fuite sous l'évier de la cuisine, apparue il y a deux jours, avec de l'eau qui goutte en continu.",
  "job_type": "Réparation fuite évier",
  "urgency": "urgent",
  "technical_elements": ["fuite au niveau du siphon", "meuble sous évier abîmé"],
  "estimated_hours_min": 1,
  "estimated_hours_max": 3,
  "complexity": "simple",
  "material_cost_share": 0.15,
  "confidence": "moyenne",
  "missing_info": ["âge de l'installation"]
}`;
