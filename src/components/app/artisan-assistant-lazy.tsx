"use client";

import dynamic from "next/dynamic";

/**
 * Assistant IA chargé après l'hydratation (refacto latence, point 7) : son
 * code (~11 KB gz + dépendances `lib/ai`) sort du chargement initial de
 * toutes les pages `/app`. Le bouton flottant s'affichait déjà seulement
 * côté client ; une ouverture demandée avant son chargement (bouton « IA »
 * de la page devis) est mise en attente par `assistant-bridge`.
 */
export const ArtisanAssistantLazy = dynamic(
  () => import("./artisan-assistant").then((m) => m.ArtisanAssistant),
  { ssr: false },
);
