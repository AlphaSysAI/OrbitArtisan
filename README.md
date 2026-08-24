# Soline — Documentation technique et fonctionnelle

**Document de description de création**

| | |
|---|---|
| **Produit** | Soline — Secrétariat IA & Gestion pour artisans du BTP |
| **Éditeur** | AlphaSysAI (Entreprise individuelle) |
| **Dirigeant** | Florian LAPERTOT |
| **Siège** | 4 Rue Barbès, 11700 Capendu, France |
| **SIREN** | 105815633 |
| **SIRET** | 10581563300018 |
| **Contact** | contact@alphasys.tech |
| **Site public** | solinebtp.fr |
| **Application** | app.solinebtp.fr |
| **Date de rédaction** | 14 août 2026 |
| **Dépôt source** | OrbitArtisan (nom interne du dépôt Git) |

---

## Table des matières

1. [Résumé exécutif](#1-résumé-exécutif)
2. [Problème adressé et proposition de valeur](#2-problème-adressé-et-proposition-de-valeur)
3. [Utilisateurs et rôles](#3-utilisateurs-et-rôles)
4. [Fonctionnalités détaillées](#4-fonctionnalités-détaillées)
5. [Parcours utilisateurs (flux métier)](#5-parcours-utilisateurs-flux-métier)
6. [Intelligence artificielle](#6-intelligence-artificielle)
7. [Secrétariat vocal Soline (Twilio + agent vocal)](#7-secrétariat-vocal-soline-twilio--agent-vocal)
8. [Tunnel de leads et acquisition prospects](#8-tunnel-de-leads-et-acquisition-prospects)
9. [Facturation, devis et conformité légale](#9-facturation-devis-et-conformité-légale)
10. [Modèle économique et tarification](#10-modèle-économique-et-tarification)
11. [Architecture technique](#11-architecture-technique)
12. [Schéma de données](#12-schéma-de-données)
13. [API et intégrations externes](#13-api-et-intégrations-externes)
14. [Sécurité et conformité RGPD](#14-sécurité-et-conformité-rgpd)
15. [Éléments distinctifs et originalité](#15-éléments-distinctifs-et-originalité)
16. [État d'avancement et évolutions prévues](#16-état-davancement-et-évolutions-prévues)
17. [Annexes](#annexes)

---

## 1. Résumé exécutif

**Soline** est une plateforme SaaS (Software as a Service) destinée aux **artisans et TPE du bâtiment** (plomberie, électricité, couverture, maçonnerie, etc.). Elle centralise l'ensemble de l'activité commerciale et administrative d'un artisan :

- création et suivi de **devis** et **factures** ;
- **planning** et prise de rendez-vous ;
- **messagerie** avec les clients ;
- **site vitrine** public et **widget embarquable** sur sites tiers ;
- **qualification automatique de prospects** via un tunnel d'estimation alimenté par IA ;
- **secrétaire vocale intelligente** (Soline) disponible 24h/24 pour répondre aux appels et prendre des RDV ;
- **facturation électronique** conforme à la réglementation française (Factur-X, e-invoicing B2B, e-reporting B2C).

L'originalité du produit réside dans l'**orchestration bout-en-bout** : un prospect anonyme peut décrire son besoin (texte, photos, localisation), être qualifié par IA, être géolocalisé et matché avec 2 à 3 artisans proches, puis voir son dossier **dispatché automatiquement** dans la messagerie de chaque artisan avec un **brouillon de devis pré-rempli** — le tout sans que le prospect ait besoin de créer un compte au départ.

---

## 2. Problème adressé et proposition de valeur

### 2.1 Problèmes des artisans BTP

| Problème | Réponse Soline |
|----------|----------------|
| Perte d'appels pendant les chantiers | Secrétaire vocale IA (Soline) avec prise de RDV automatique |
| Devis longs à rédiger | Assistant IA + génération de brouillon depuis chat ou lead |
| Prospects non qualifiés | Tunnel d'estimation avec chat IA, fourchette de prix, matching géo |
| Multi-outils (Excel, WhatsApp, agenda papier) | Plateforme unifiée : devis, factures, RDV, messages |
| Facturation électronique obligatoire (2026+) | Pipeline Factur-X + Plateforme Agréée + e-reporting B2C |
| Visibilité en ligne limitée | Vitrine publique + widget embed pour site existant |

### 2.2 Proposition de valeur

Soline positionne l'artisan comme **professionnel digitalisé** : il reçoit des leads qualifiés, répond par la voix ou le chat, convertit en devis signés, facture conformément à la loi, et encaisse via Stripe — depuis une seule application web progressive (PWA).

---

## 3. Utilisateurs et rôles

### 3.1 Artisan (compte `profiles`)

- **Accès :** `/app/*` après authentification Supabase
- **Gère :** profil commercial, prestations, planning, contacts, devis, factures, messagerie, réglages (widget, vocal)
- **Peut recevoir** des leads matchés automatiquement

### 3.2 Client final (compte `customer_profiles`)

- **Accès :** `/compte/*`, `/mes-devis/*`
- **Consulte** et accepte/refuse les devis
- **Paie** les factures (Stripe Checkout si l'artisan a activé Stripe Connect)
- **Recherche** des artisans à proximité par métier

### 3.3 Visiteur anonyme (public)

- **Accès :** `/`, `/estimation`, `/site/[slug]`, `/embed/[slug]`
- **Peut lancer** une estimation sans compte
- **Peut prendre RDV** sur la vitrine d'un artisan
- **Peut utiliser** le widget embed sur un site tiers

### 3.4 Séparation des rôles

Un middleware Next.js (`src/middleware.ts`) empêche un client d'accéder à l'espace artisan et inversement. L'authentification repose sur Supabase Auth avec typage de compte (`src/lib/auth/account-type.ts`).

---

## 4. Fonctionnalités détaillées

### 4.1 Espace artisan (`/app`)

| Module | Route | Description |
|--------|-------|-------------|
| Tableau de bord | `/app` | Vue d'ensemble activité |
| Profil | `/app/profile` | Identité, logo, coordonnées |
| Réglages | `/app/reglages` | Métier, adresse (géocodage BAN), prestations, widget embed, numéro vocal |
| Prestations | `/app/services` | Catalogue de services (durée, tarif) |
| Planning | `/app/rdv` | Calendrier, création/annulation RDV |
| Contacts | `/app/contacts` | Clients liés, historique |
| Messages | `/app/messages` | Conversations, pièces jointes (photos leads) |
| Devis | `/app/quotes` | CRUD, envoi, suivi statuts (draft/sent/accepted/rejected) |
| Factures | `/app/invoices` | Conversion depuis devis accepté, finalisation, export PDF/Factur-X |
| Assistant IA | FAB flottant | Navigation, questions métier, création RDV/devis par voix ou texte |

### 4.2 Espace client (`/compte`)

| Module | Route | Description |
|--------|-------|-------------|
| Accueil | `/compte` | RDV, statistiques |
| Recherche | `/compte/recherche` | Annuaire artisans par métier + proximité (haversine) |
| Devis | `/mes-devis` | Consultation, acceptation/refus (RPC sécurisées) |
| Factures | `/compte/factures` | Paiement Stripe Checkout |
| Messages | `/compte/messages` | Échanges avec artisan(s) |
| Réglages | `/compte/reglages` | Profil client |

### 4.3 Parcours public

| Module | Route | Description |
|--------|-------|-------------|
| Landing marketing | `/` | Présentation produit, tarifs, CTA inscription |
| Estimation | `/estimation` | Tunnel IA en 4 étapes (métier → chat → localisation → médias) |
| Suivi lead | `/estimation/suivi` | Suivi via token porteur |
| Vitrine artisan | `/site/[slug]` | Fiche publique, services, prise RDV |
| Widget embed | `/embed/[slug]` | Iframe + script `public/embed.js`, API `window.Soline` |

### 4.4 Pages légales

- `/cgu` — Conditions générales d'utilisation
- `/mentions-legales` — Mentions légales
- `/confidentialite` — Politique de confidentialité

Source unique des informations légales : `src/lib/legal/site-legal-info.ts`

### 4.5 Invitations plateforme

Système d'invitation par email/token permettant à un artisan d'inviter un client (ou inversement) à rejoindre la plateforme (`platform_invitations`, `src/lib/invitations/`).

---

## 5. Parcours utilisateurs (flux métier)

### 5.1 Cycle de vie d'un devis

```
Artisan crée brouillon (manuel ou IA)
    → Ajoute prestations + matériaux (catalogue fournisseur optionnel)
    → Envoie au client (statut: sent)
    → Client accepte (RPC client_accept_quote) ou refuse
    → Si accepté : conversion en facture
    → Finalisation (Factur-X B2B ou PDF + e-reporting B2C)
    → Paiement Stripe (optionnel)
```

### 5.2 Cycle de vie d'un rendez-vous

```
Prospect sur vitrine / widget / vocal Soline
    → Créneau proposé selon disponibilités artisan
    → RDV créé (pending ou confirmed)
    → Si prospect sans compte : pending_vitrine_appointments
    → À l'inscription client : finalisation automatique du RDV
```

### 5.3 Cycle de vie d'un lead (tunnel estimation)

```
1. Prospect choisit un métier (taxonomie BTP ~100 métiers)
2. Chat IA qualification (questions séquentielles, max configurable)
3. Localisation (API BAN data.gouv.fr ou géolocalisation navigateur)
4. Upload photos/vidéos (bucket privé Supabase lead-media)
5. Qualification IA → JSON structuré (nature, urgence, complexité, heures, matériaux)
6. Estimation fourchette prix (min/max en centimes)
7. Matching géographique : 2-3 artisans dans un rayon (~40 km)
8. Prospect saisit coordonnées (nom, email, téléphone)
9. Dispatch automatique (dispatchLeadToArtisans) :
   - Création conversation artisan ↔ lead
   - Message récap structuré (buildLeadRecapMessage)
   - Pièces jointes (photos) en message_attachments
   - Brouillon de devis pré-rempli (buildLeadQuoteDraft)
10. Suivi via token public : /estimation/suivi
11. Conversion : prospect s'inscrit → claim_lead
```

**Fichiers clés :**

- `src/app/estimation/` — UI tunnel
- `src/lib/leads/dispatch-lead.ts` — dispatch idempotent
- `src/lib/leads/build-lead-quote-draft.ts` — brouillon devis
- `src/lib/ai/qualify-lead.ts` — qualification IA

---

## 6. Intelligence artificielle

### 6.1 Fournisseur

**Mistral AI** (API REST `https://api.mistral.ai/v1`)  
Client interne : `src/lib/ai/mistral.ts`

| Usage | Modèle | Fichier |
|-------|--------|---------|
| Chat général (assistant, leads, devis) | `open-mistral-nemo` (surchargeable via `MISTRAL_CHAT_MODEL`) | `mistral.ts` |
| Embeddings catalogue matériaux | `mistral-embed` (1024 dimensions) | `src/lib/ai/embeddings.ts` |
| Vision photos leads (prévu) | `MISTRAL_VISION_MODEL` | `prompt-cursor-vision-photos-lead.md` |

### 6.2 Capacités IA implémentées

#### Assistant artisan (`POST /api/ai/assistant`)

- Compréhension d'intentions : navigation, questions sur RDV/devis/factures en attente
- Création de rendez-vous par langage naturel
- Brouillon de devis depuis dictée ou texte
- Fast-paths déterministes pour réponses rapides sans appel LLM (`assistant-fast-path.ts`)
- Requêtes données métier (`assistant-data-query.ts`)

#### Qualification de lead (`qualifyLead`)

Extraction structurée (schéma Zod + JSON Schema Mistral) :

- Nature du besoin, urgence, complexité
- Estimation heures main-d'œuvre, part matériaux
- Fourchette de prix indicative

Schéma : `src/lib/ai/qualify-lead-schema.ts`

#### Chat estimation (`POST /api/estimation/chat`)

Questions séquentielles adaptées au métier choisi. Fallback heuristique si Mistral indisponible.

#### Génération de devis depuis texte (`POST /api/ai/generate-quote-from-chat`)

- Extraction prestations, main-d'œuvre, matériaux
- Matching catalogue fournisseur via **pgvector** (similarité cosinus)
- RPC PostgreSQL : `match_supplier_products`

#### Suggestions rédactionnelles

- `POST /api/ai/suggest-reply` — suggestion de réponse messagerie
- `POST /api/ai/suggest-quote-notes` — notes de devis
- `POST /api/ai/summarize-quote` — résumé de devis

### 6.3 Catalogue matériaux vectorisé

Table `supplier_products` avec colonne `embedding vector(1024)`.  
Script de seed : `scripts/seed-supplier-embeddings.ts` (catalogue type Brico Dépôt).

---

## 7. Secrétariat vocal Soline (Twilio + agent vocal)

### 7.1 Concept

**Soline** est le nom de l'agent vocal intelligent qui répond aux appels téléphoniques des clients de l'artisan, 24h/24. L'agent est hébergé chez **ElevenLabs** (sous-traitant documenté). Il communique avec l'application Soline via des **tools REST** authentifiés.

### 7.2 Architecture découplée

```
Appel entrant (Twilio, numéro E.164)
    → Agent vocal ElevenLabs
    → Appels REST vers Soline (Bearer VOICE_AI_TOOL_SECRET)
        POST /api/voice/artisan/create-quote-draft — proposition de devis (résumé + brouillon IA)
        POST /api/voice/artisan/availability  — créneaux libres (optionnel)
        POST /api/voice/artisan/schedule      — désactivé (RDV vocal en pause)
        POST /api/voice/artisan/appointment-info — info RDV existant
    → Artisan valide dans /app/appels (email client à la validation)
    → Twilio StatusCallback
        POST /api/webhooks/twilio/status
    → Décompte minutes + quota abonnement
```

### 7.3 Quota vocal

| Plan | Minutes incluses/mois |
|------|----------------------|
| Base | 0 |
| Pro | 60 |
| Premium | 150 |

**Recharges :** Pack 60 min (39 € HT), Pack 150 min (79 € HT)

**Implémentation quota :**

- Colonnes `profiles` : `subscription_plan`, `voice_minutes_included`, `voice_minutes_used`, `voice_minutes_overdue`, `billing_cycle_reset_at`
- Table `voice_call_logs` : journal appels Twilio
- RPC atomique idempotente : `process_twilio_voice_call_status`
- Règle : `Math.ceil(CallDuration / 60)` minutes facturées si statut `completed`
- Alertes logs à 80 % et 100 % du quota (`voice-quota-alerts.ts`)

**Fichiers :**

- `src/lib/voice/voice-quota-service.ts`
- `src/lib/voice/twilio-minutes.ts`
- `src/lib/voice/twilio-signature.ts`
- `supabase/migration/01_voice_quota.sql`

### 7.4 Mapping numéros

Table `artisan_voice_numbers` : association numéro E.164 ↔ artisan.

---

## 8. Tunnel de leads et acquisition prospects

### 8.1 Widget embed

Script JavaScript `public/embed.js` injectable sur tout site web :

```javascript
window.Soline.open();   // ouvre le widget
window.Soline.close();  // ferme
window.Soline.toggle(); // bascule
```

Le widget charge une iframe `/embed/[slug]` avec le wizard d'estimation pré-configuré pour l'artisan hôte (`originArtisanSlug`).  
CSP `frame-ancestors *` uniquement sur `/embed/*`.

Configuration dans `/app/reglages` : `embed-widget-card.tsx`

### 8.2 Taxonomie métiers BTP

Fichier `src/lib/trades/taxonomy.ts` : ~15 catégories, ~100 métiers (plombier, couvreur, électricien, etc.). Utilisée pour filtrage, matching, thème vitrine.

### 8.3 Matching géographique

RPC `match_leads_to_artisans` : sélection de 2 à 3 artisans dans un rayon configurable (~40 km) selon métier et coordonnées GPS. Algorithme haversine via `search_artisans_nearby`.

### 8.4 Sécurité leads anonymes

- Accès lead via **token porteur** (`public_token`) — pas de session requise
- Bucket `lead-media` privé, RLS stricte
- RPC `security definer` pour opérations cross-tenant (dispatch, claim)

---

## 9. Facturation, devis et conformité légale

### 9.1 Devis

- Statuts : `draft`, `sent`, `accepted`, `rejected`
- Lignes : `quote_services` (prestations), `quote_materials` (matériaux + lien catalogue)
- Signature client via RPC sécurisées
- Export PDF

### 9.2 Factures

- Relation 1:1 devis accepté → facture
- Lignes : `invoice_lines` (type labor/service/material)
- Statuts métier + statuts e-invoicing

### 9.3 Pipeline de finalisation (`InvoiceService`)

Fichier : `src/lib/billing/invoicing/invoice-service.ts`

```
Chargement document BDD
    → Classification client B2B vs B2C (SIREN + TVA)
    → B2B :
        Génération Factur-X (XML CII EN16931 + PDF/A-3)
        Soumission Plateforme Agréée (PA_PROVIDER)
        Suivi statuts via webhooks PA
    → B2C :
        PDF simple
        Enqueue e_reporting_queue (transmission groupée)
```

### 9.4 Factur-X

- Package : `@stafyniaksacha/facturx`
- Profil : EN16931 / BASIC
- Fichiers : `src/lib/billing/facturx/` (build-cii-invoice, generate-factur-x, embed-factur-x-pdf, render-invoice-pdf)

Routes export :

- `GET /api/invoices/[invoiceId]/pdf`
- `GET /api/invoices/[invoiceId]/factur-x`

### 9.5 Webhooks Plateforme Agréée

- Route : `POST /api/webhooks/facturation-electronique`
- Auth : header `x-pa-signature` + `PA_WEBHOOK_SECRET`
- Audit : table `pa_webhook_events`
- Providers prévus : `pennylane`, `docaposte`, `confactura` (défaut : `noop`)

### 9.6 Paiements Stripe

- **Stripe Connect Express** : onboarding artisan pour encaissement direct
- **Stripe Checkout** : paiement facture côté client
- Webhook : `POST /api/webhooks/stripe` (paiement reçu, mise à jour compte Connect)

---

## 10. Modèle économique et tarification

Source : `src/lib/billing/subscription-plans.ts`

### 10.1 Abonnements HT

| Plan | Mensuel | Annuel | Soline (min/mois) | Différence |
|------|---------|--------|-------------------|------------|
| **Base** | 29,90 € | 299,90 € | 0 | SaaS complet, sans Soline |
| **Pro** | 69,90 € | 699,90 € | 60 | SaaS + secrétaire vocale IA |
| **Premium** | 99,90 € | 999,90 € | 150 | SaaS + plus de minutes Soline |

Le SaaS BTP est identique sur les trois formules. Seule Soline (secrétaire vocale IA) diffère.

Essai gratuit 15 jours (mentionné landing).

### 10.2 Recharges minutes Soline

| Pack | Minutes | Prix HT |
|------|---------|---------|
| Pack 60 | 60 | 39 € |
| Pack 150 | 150 | 79 € |

### 10.3 État d'implémentation billing

- Grille tarifaire affichée (landing + CGU)
- Quota vocal opérationnel en base (Twilio webhook)
- **Abonnement Stripe SaaS : non encore branché** (Stripe actuel = Connect + paiement factures)

---

## 11. Architecture technique

### 11.1 Stack

| Couche | Technologie | Version |
|--------|-------------|---------|
| Framework | Next.js (App Router) | 16.1.7 |
| UI | React | 19.2.3 |
| Langage | TypeScript | ^5 |
| Styles | Tailwind CSS | v4 |
| Composants | shadcn/ui, lucide-react | — |
| Runtime | Node.js | 20.x |
| BDD | Supabase (PostgreSQL + Auth + Storage + RLS + pgvector) | ^2.99 |
| IA | Mistral AI | API REST |
| Voix | ElevenLabs + Twilio | SDK twilio ^5.13 |
| Paiements | Stripe | ^21.0 |
| Facturation élec. | @stafyniaksacha/facturx | ^0.5 |
| PDF | pdf-lib | ^1.17 |
| Validation | Zod | ^4.4 |
| Tests | Vitest | ^4.1 |

### 11.2 Hébergement

| Composant | Hébergeur |
|-----------|-----------|
| Application web | o2switch (France) |
| Base de données | Supabase (Union européenne) |
| Build / CI | Vercel |

### 11.3 Structure du dépôt

```
OrbitArtisan/
├── src/
│   ├── app/              # Routes App Router (pages + API)
│   ├── components/       # UI (app, vitrine, landing, billing, legal…)
│   ├── lib/              # Logique métier (ai, billing, leads, stripe, supabase…)
│   └── features/voice/   # Module vocal artisan
├── supabase/
│   ├── init.sql          # Schéma complet idempotent (~3400 lignes)
│   └── migration/        # Migrations incrémentales
├── public/
│   ├── embed.js          # Widget JavaScript
│   └── sw.js             # Service Worker PWA
└── scripts/              # Seed embeddings catalogue
```

### 11.4 Patterns architecturaux

- **Server Components** + **Server Actions** pour mutations métier
- **Route Handlers** pour API REST et webhooks
- **RLS PostgreSQL** pour isolation multi-tenant
- **Service role Supabase** pour opérations cross-tenant (webhooks, dispatch leads)
- **Imports dynamiques** pour modules natifs (Factur-X / libxmljs) — compatibilité Vercel Node 20

---

## 12. Schéma de données

Fichier principal : `supabase/init.sql`

### 12.1 Tables métier

| Table | Rôle |
|-------|------|
| `profiles` | Profil artisan (identité, slug vitrine, géoloc, Stripe Connect, entité légale, abonnement, quota vocal) |
| `services` | Prestations (durée, prix centimes) |
| `appointments` | Rendez-vous (statut, lien client) |
| `pending_vitrine_appointments` | RDV en attente de compte client |
| `customer_profiles` | Profil client |
| `conversations` | Fils messagerie (lien lead optionnel) |
| `messages` | Messages texte |
| `message_attachments` | Pièces jointes messagerie |
| `quotes` | Devis |
| `quote_services` | Lignes prestations devis |
| `quote_materials` | Lignes matériaux devis |
| `invoices` | Factures |
| `invoice_lines` | Lignes facture |
| `platform_invitations` | Invitations email/token |
| `supplier_products` | Catalogue fournisseur + embedding vector(1024) |
| `artisan_voice_numbers` | Numéros Twilio ↔ artisan |
| `leads` | Prospects tunnel estimation |
| `lead_media` | Photos/vidéos lead |
| `lead_matches` | Matching lead → artisans |
| `e_reporting_queue` | File e-reporting B2C |
| `pa_webhook_events` | Audit webhooks PA |
| `voice_call_logs` | Journal appels + minutes |

### 12.2 Extensions PostgreSQL

- `pgcrypto` — tokens, UUID
- `vector` (pgvector) — recherche similarité catalogue matériaux

### 12.3 RPC significatives

- `create_lead`, `update_lead_brief`, `match_leads_to_artisans`, `claim_lead`
- `client_accept_quote`, `client_reject_quote`
- `search_artisans_nearby`, `match_supplier_products`
- `process_twilio_voice_call_status`
- `lookup_auth_user_id_by_email`

### 12.4 Storage

Bucket privé `lead-media` : photos/vidéos leads (max 50 Mo/fichier).

---

## 13. API et intégrations externes

### 13.1 Routes API internes

| Méthode | Route | Rôle |
|---------|-------|------|
| POST | `/api/ai/assistant` | Assistant artisan |
| POST | `/api/ai/qualify-lead` | Qualification lead |
| POST | `/api/ai/generate-quote-from-chat` | Brouillon devis |
| POST | `/api/ai/suggest-reply` | Suggestion réponse |
| POST | `/api/ai/suggest-quote-notes` | Notes devis |
| POST | `/api/ai/summarize-quote` | Résumé devis |
| POST | `/api/estimation/chat` | Chat qualification prospect |
| GET | `/api/invoices/[id]/pdf` | PDF facture |
| GET | `/api/invoices/[id]/factur-x` | Export Factur-X |
| POST | `/api/voice/artisan/create-quote-draft` | Proposition de devis depuis appel |
| POST | `/api/voice/artisan/availability` | Créneaux vocaux |
| POST | `/api/voice/artisan/schedule` | Désactivé (RDV vocal) |
| POST | `/api/voice/artisan/appointment-info` | Info RDV |
| POST | `/api/webhooks/stripe` | Paiements Stripe |
| POST | `/api/webhooks/twilio/status` | Quota vocal Twilio |
| POST | `/api/webhooks/facturation-electronique` | Callbacks PA |

### 13.2 Variables d'environnement (noms uniquement)

| Variable | Usage |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique |
| `SUPABASE_SERVICE_ROLE_KEY` | Opérations admin |
| `NEXT_PUBLIC_SITE_URL` | URL canonique |
| `MISTRAL_API_KEY` | API Mistral |
| `MISTRAL_CHAT_MODEL` | Surcharge modèle chat |
| `MISTRAL_VISION_MODEL` | Modèle vision (prévu) |
| `STRIPE_SECRET_KEY` | API Stripe |
| `STRIPE_WEBHOOK_SECRET` | Validation webhooks Stripe |
| `STRIPE_PAYMENT_LINK_BASE_MONTHLY` | Lien de paiement Stripe — Base mensuel |
| `STRIPE_PAYMENT_LINK_BASE_ANNUAL` | Lien de paiement Stripe — Base annuel |
| `STRIPE_PAYMENT_LINK_PRO_MONTHLY` | Lien de paiement Stripe — Pro mensuel |
| `STRIPE_PAYMENT_LINK_PRO_ANNUAL` | Lien de paiement Stripe — Pro annuel |
| `STRIPE_PAYMENT_LINK_PREMIUM_MONTHLY` | Lien de paiement Stripe — Premium mensuel |
| `STRIPE_PAYMENT_LINK_PREMIUM_ANNUAL` | Lien de paiement Stripe — Premium annuel |
| `TWILIO_AUTH_TOKEN` | Signature webhooks Twilio |
| `TWILIO_STATUS_CALLBACK_URL` | Callback explicite |
| `VOICE_AI_TOOL_SECRET` | Auth tools vocaux |
| `PA_PROVIDER` | Fournisseur PA |
| `PA_WEBHOOK_SECRET` | Auth webhooks PA |

### 13.3 APIs publiques sans clé

- **BAN** (data.gouv.fr) — géocodage adresses françaises (`src/lib/geo/ban.ts`)

### 13.4 Sous-traitants documentés

Supabase, o2switch, Mistral AI, ElevenLabs, Stripe — voir `src/lib/legal/site-legal-info.ts`

---

## 14. Sécurité et conformité RGPD

- **RLS** activé sur toutes les tables métier
- **Isolation multi-tenant** : un artisan ne voit que ses données
- **Leads anonymes** : accès par token, pas d'INSERT anon direct
- **Hébergement UE** : Supabase (BDD), o2switch (app)
- **Pages légales** : CGU, confidentialité, mentions légales à jour (14 août 2026)
- **Données IA** : textes prospects/clients traités par Mistral AI (mentionné confidentialité)
- **Données vocales** : traitées par ElevenLabs (option Secrétariat IA)
- **Paiements** : Stripe (PCI-DSS)

---

## 15. Éléments distinctifs et originalité

Les éléments suivants constituent l'**originalité** de la création Soline :

1. **Pipeline lead bout-en-bout** : estimation anonyme → qualification IA → matching géo → dispatch automatique (conversation + brouillon devis + médias) sans compte initial prospect.

2. **Assistant artisan multimodal métier** : fast-paths déterministes + LLM pour intents, extraction devis, matching contacts/services, recherche matériaux vectorielle pgvector.

3. **Architecture vocale découplée** : agent tiers (ElevenLabs) + tools REST authentifiés + quota Twilio atomique idempotent en PostgreSQL.

4. **Routage facturation intelligent B2B/B2C** : Factur-X + Plateforme Agréée vs e-reporting queue selon classification SIREN/TVA automatique.

5. **Taxonomie métiers BTP** intégrée (~15 catégories, ~100 métiers) pour matching, vitrine thématisée, qualification IA contextualisée.

6. **Widget embed** (`embed.js`) avec API JavaScript `window.Soline` et tunnel d'estimation intégré en iframe.

7. **Schéma SQL monolithique idempotent** (`init.sql`) + migrations numérotées — conception rejouable pour déploiement Supabase reproductible.

8. **Dispatch lead idempotent** : rejeu sans duplication (ignore matchs déjà dispatchés).

---

## 16. État d'avancement et évolutions prévues

### 16.1 Fonctionnel et opérationnel

- Application artisan complète (devis, factures, RDV, messages, réglages)
- Espace client (devis, factures, recherche, messages)
- Tunnel estimation public + widget embed
- Vitrine artisan publique
- Assistant IA artisan
- Qualification lead IA (texte)
- Dispatch lead automatique
- Factur-X + pipeline e-invoicing
- Stripe Connect + paiement factures
- Quota vocal Twilio (backend)
- Landing marketing + pages légales
- PWA (manifest, service worker)

### 16.2 En cours / prévu

- Analyse vision des photos leads (Mistral multimodal) — spec : `prompt-cursor-vision-photos-lead.md`
- Abonnement Stripe SaaS (choix plan à l'inscription)
- UI consommation/recharge minutes dans `/app/reglages`
- Sync automatique quota selon plan actif
- Configuration infra Twilio (status callback, migration Supabase quota)
- Médiateur de la consommation (CGU)

---

## Annexes

### Annexe A — Commandes de développement

```bash
npm install
npm run dev      # Serveur local http://localhost:3000
npm run build    # Build production
npm run test     # Tests Vitest
npm run lint     # ESLint
```

Node.js 20.x requis (`.nvmrc`).

### Annexe B — Auteur et droits

**Créateur et éditeur :** Florian LAPERTOT, AlphaSysAI  
**Produit :** Soline  
**Année de création :** 2025–2026  
**Tous droits réservés.**

Ce document décrit l'état du logiciel au **14 août 2026** et constitue une description technique et fonctionnelle de la création Soline aux fins de preuve d'antériorité.

---

*Fin du document.*
