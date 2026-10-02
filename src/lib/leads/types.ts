/** Types et constantes du tunnel d'estimation, partagés client/serveur. */

export const LEAD_MEDIA_BUCKET = "lead-media";

export type LeadSession = { leadId: string; token: string };

export type LeadEstimate = { min: number; max: number; basis: string };

export type MatchedArtisan = {
  id: string;
  businessName: string;
  slug: string;
  distanceKm: number | null;
  rank: number;
  /** Lot (corps d'état) pour lequel l'artisan est retenu ; null = demande mono-métier historique. */
  lotIndex: number;
  lotLabel: string | null;
  city: string | null;
  logoUrl: string | null;
  phone: string | null;
};
