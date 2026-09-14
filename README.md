# Soline — Documentation du projet OrbitArtisan

| | |
|---|---|
| **Produit** | Soline — Secrétariat IA & gestion pour artisans du BTP |
| **Dépôt Git** | OrbitArtisan (nom interne) |
| **Éditeur** | AlphaSysAI — Florian LAPERTOT |
| **Site marketing** | [solinebtp.fr](https://solinebtp.fr) |
| **Application** | [app.solinebtp.fr](https://app.solinebtp.fr) |
| **Contact** | contact@alphasys.tech |

Ce document décrit **comment fonctionne le projet** : architecture, flux métier, intégrations et déploiement. Une **partie Résumé** en fin de document présente le produit comme un pitch commercial.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Stack technique](#2-stack-technique)
3. [Structure du dépôt](#3-structure-du-dépôt)
4. [Domaines et routage](#4-domaines-et-routage)
5. [Utilisateurs, auth et sécurité d'accès](#5-utilisateurs-auth-et-sécurité-daccès)
6. [Espaces et modules fonctionnels](#6-espaces-et-modules-fonctionnels)
7. [Flux métier principaux](#7-flux-métier-principaux)
8. [Intelligence artificielle](#8-intelligence-artificielle)
9. [Secrétariat vocal Soline](#9-secrétariat-vocal-soline)
10. [Facturation, conformité et paiements](#10-facturation-conformité-et-paiements)
11. [Recouvrement des impayés](#11-recouvrement-des-impayés)
12. [Tunnel de leads et acquisition](#12-tunnel-de-leads-et-acquisition)
13. [Modèle économique](#13-modèle-économique)
14. [Base de données et migrations](#14-base-de-données-et-migrations)
15. [API, webhooks et crons](#15-api-webhooks-et-crons)
16. [Variables d'environnement](#16-variables-denvironnement)
17. [Développement local](#17-développement-local)
18. [Déploiement (Vercel)](#18-déploiement-vercel)
19. [Résumé — ce que fait Soline](#19-résumé--ce-que-fait-soline)

---

## 1. Vue d'ensemble

Soline est une **application web SaaS** (Progressive Web App) construite avec **Next.js App Router**. Elle centralise l'activité commerciale et administrative des artisans du bâtiment dans une seule plateforme.

### Principes d'architecture

| Principe | Implémentation |
|----------|----------------|
| Rendu | Server Components Next.js + Server Actions pour les mutations |
| API | Route Handlers (`/api/*`) pour REST, webhooks et crons |
| Données | Supabase (PostgreSQL + Auth + Storage + RLS) |
| Multi-tenant | Chaque artisan ne voit que ses données (RLS) ; opérations cross-tenant via service role |
| IA | Mistral AI (texte) ; agent vocal ElevenLabs (voix) branché par tools REST |
| Paiements | Stripe (Connect pour encaissement artisan, Checkout pour factures client, Billing pour abonnements) |

### Schéma global

```
Visiteur / Client / Artisan
        │
        ▼
  Next.js (Vercel) — middleware + App Router
        │
        ├── Supabase Auth (sessions cookies SSR)
        ├── PostgreSQL + RLS (métier, quotas, audit)
        ├── Storage (lead-media, recovery-documents)
        │
        ├── Mistral AI (assistant, leads, devis)
        ├── ElevenLabs + Twilio (secrétaire vocale)
        ├── Stripe (paiements, abonnements)
        ├── Plateforme Agréée (e-facturation B2B)
        ├── MySendingBox (LRAR) + RubyPayeur (recouvrement)
        └── BAN data.gouv.fr (géocodage adresses FR)
```

---

## 2. Stack technique

| Couche | Technologie | Version |
|--------|-------------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.1.7 |
| UI | React + Tailwind CSS v4 + shadcn/ui | React 19.2.3 |
| Langage | TypeScript | ^5 |
| Runtime | Node.js | **24.x** (`.nvmrc`, `engines`) |
| BDD | Supabase (PostgreSQL, Auth, Storage, pgvector) | ^2.99 |
| IA texte | Mistral AI | API REST |
| Voix | Twilio (téléphonie, webhooks) + ElevenLabs (agent) | twilio ^5.13 |
| Paiements | Stripe | ^21.0 |
| Factur-X | `@stackforge-eu/factur-x` (prod, libxml2-wasm) | ^1.4 |
| PDF | pdf-lib | ^1.17 |
| Validation | Zod | ^4.4 |
| Tests | Vitest | ^4.1 |
| Hébergement | Vercel (build + fonctions serverless + crons) | — |

> **Factur-X en production** : génération XML CII via sérialiseur interne (`cii-to-xml.ts`, sans libxmljs natif). Validation XSD/Schematron via `@stackforge-eu/factur-x`. `@stafyniaksacha/facturx` est réservé aux tests locaux (devDependency).

---

## 3. Structure du dépôt

```
OrbitArtisan/
├── src/
│   ├── app/                 # Routes App Router (pages + API)
│   │   ├── app/             # Espace artisan (/app/*)
│   │   ├── compte/          # Espace client
│   │   ├── admin/           # Super-admin plateforme
│   │   ├── estimation/      # Tunnel leads public
│   │   ├── site/[slug]/     # Vitrine artisan
│   │   ├── embed/[slug]/    # Widget iframe
│   │   └── api/             # REST, webhooks, crons
│   ├── components/          # UI (app, vitrine, landing, recovery, admin…)
│   ├── lib/                 # Logique métier (ai, billing, leads, supabase…)
│   └── features/voice/      # Module vocal (tools, auth)
├── supabase/
│   ├── init.sql             # Schéma complet idempotent (~3400 lignes)
│   └── migration/           # Migrations incrémentales 01 → 12
├── public/
│   ├── embed.js             # Widget JavaScript embarquable
│   └── sw.js                # Service Worker PWA
├── vercel.json              # Crons Vercel
├── next.config.ts           # Headers CSP embed, packages externes
└── .env.example             # Variables d'environnement documentées
```

### Dossiers `src/lib/` importants

| Dossier | Rôle |
|---------|------|
| `ai/` | Mistral, assistant artisan, qualification leads, embeddings pgvector |
| `billing/` | Devis, factures, Factur-X, e-reporting, abonnements, relances BTP |
| `leads/` | Tunnel estimation, dispatch, matching géographique |
| `recovery/` | Mise en demeure LRAR, quota, contexte recouvrement |
| `voice/` | Quota vocal mois civil, journal Twilio |
| `supabase/` | Clients browser / server / service-role |
| `auth/` | Types de compte, admin plateforme, impersonation |
| `domain-routing.ts` | Séparation solinebtp.fr ↔ app.solinebtp.fr |
| `site-url.ts` | URLs canoniques marketing / app |

---

## 4. Domaines et routage

En production, deux domaines coexistent :

| Domaine | Rôle | Variable |
|---------|------|----------|
| `solinebtp.fr` | Landing marketing, tarifs, pages légales | `NEXT_PUBLIC_MARKETING_URL` |
| `app.solinebtp.fr` | Application SaaS (artisan, client, vitrines) | `NEXT_PUBLIC_SITE_URL` |

### Middleware (`src/middleware.ts`)

Le middleware exécute, dans l'ordre :

1. **Routage inter-domaines** (`resolveDomainRouting`) — sur le domaine marketing, seuls `/`, les pages légales et `/embed.js` sont servis ; le reste redirige vers l'app. Sur le domaine app, les pages légales redirigent vers le marketing.
2. **Session Supabase** — rafraîchissement cookies SSR.
3. **Typage utilisateur** — artisan (`profiles`) vs client (`customer_profiles`).
4. **Protection des routes** — `/app/*` réservé aux artisans, `/compte/*` et `/mes-devis/*` aux clients.
5. **Admin** — accès `/admin/*` via table `platform_admins`.
6. **Comptes suspendus** — redirection vers `/app/suspended`.
7. **Contrôle abonnement** — blocage création devis/factures si essai expiré ou abonnement impayé.

En local ou sur preview Vercel mono-domaine, la séparation est désactivée si marketing et app partagent le même hostname.

### Widget embed et CSP

- `/embed/[slug]` : iframe du tunnel d'estimation, `frame-ancestors *` (seule route embarquable).
- `public/embed.js` : API `window.Soline.open()`, `.close()`, `.toggle()`.
- Toutes les autres routes refusent l'encadrement (`X-Frame-Options: SAMEORIGIN`).

---

## 5. Utilisateurs, auth et sécurité d'accès

### Trois profils d'utilisation

| Profil | Table | Espace | Accès |
|--------|-------|--------|-------|
| **Artisan** | `profiles` | `/app/*` | Devis, factures, RDV, messages, réglages, vitrine |
| **Client final** | `customer_profiles` | `/compte/*`, `/mes-devis/*` | Accepter devis, payer factures, messages |
| **Visiteur anonyme** | — | `/`, `/estimation`, `/site/[slug]` | Estimation, prise de RDV, consultation vitrine |

L'authentification repose sur **Supabase Auth** (email/mot de passe, callback `/auth/callback`). Le typage artisan/client est déterminé par la présence d'une ligne dans `profiles` ou `customer_profiles` (`src/lib/auth/account-type.ts`).

### Invitations

Le système `platform_invitations` permet à un artisan d'inviter un client (ou l'inverse) par email + token (`/invitation/[token]`).

### Isolation des données

- **RLS PostgreSQL** sur toutes les tables métier.
- **Service role** Supabase pour les opérations légitimes cross-tenant : webhooks, crons, dispatch de leads, recouvrement.
- **Leads anonymes** : accès par token porteur (`public_token`), pas d'INSERT direct anonyme.

---

## 6. Espaces et modules fonctionnels

### Espace artisan (`/app`)

| Module | Route | Description |
|--------|-------|-------------|
| Tableau de bord | `/app` | Vue d'ensemble activité, raccourcis |
| Profil | `/app/profile` | Identité, logo, coordonnées |
| Réglages | `/app/reglages` | Métier, adresse (BAN), prestations, widget embed, vocal, abonnement |
| Prestations | `/app/services` | Catalogue services (durée, tarif) |
| Planning | `/app/rdv` | Calendrier, création/validation RDV |
| Appels Soline | `/app/appels` | Validation des propositions de devis issues des appels vocaux |
| Contacts | `/app/contacts` | Clients liés, historique |
| Messages | `/app/messages` | Conversations, pièces jointes (photos leads) |
| Devis | `/app/quotes` | CRUD, envoi, suivi statuts |
| Factures | `/app/invoices` | Conversion, finalisation, PDF/Factur-X, recouvrement |
| Chantiers | `/app/chantiers` | Suivi chantiers, saisie temps MO |
| Interventions | `/app/interventions` | Bons d'intervention, signature client |
| Ouvrages | `/app/ouvrages` | Bibliothèque ouvrages pré-chiffrés |
| Fournisseurs | `/app/fournisseurs` | Référentiel fournisseurs |
| Assistant IA | FAB flottant | Navigation, RDV, brouillon devis (texte ou voix) |

### Espace client (`/compte`)

| Module | Route | Description |
|--------|-------|-------------|
| Accueil | `/compte` | RDV, statistiques |
| Recherche | `/compte/recherche` | Annuaire artisans par métier + proximité (haversine) |
| Devis | `/mes-devis` | Consultation, acceptation/refus (RPC sécurisées) |
| Factures | `/compte/factures` | Consultation, paiement Stripe Checkout |
| Messages | `/compte/messages` | Échanges avec artisan(s) |
| Réglages | `/compte/reglages` | Profil client |

### Parcours public

| Module | Route | Description |
|--------|-------|-------------|
| Landing | `/` | Présentation, tarifs, CTA inscription |
| Estimation | `/estimation` | Tunnel IA en 4 étapes |
| Suivi lead | `/estimation/suivi` | Suivi via token porteur |
| Vitrine | `/site/[slug]` | Fiche publique, services, RDV, messages |
| Devis public | `/devis/[token]` | Consultation devis sans compte |
| Intervention | `/intervention/[token]` | Signature bon d'intervention |
| Widget | `/embed/[slug]` | Tunnel embarqué pour sites tiers |

### Admin plateforme (`/admin`)

Réservé aux `platform_admins` : métriques, liste/suspension des artisans (tenants), journal d'audit, impersonation.

---

## 7. Flux métier principaux

### Cycle de vie d'un devis

```
Artisan crée brouillon (manuel, assistant IA ou appel vocal)
    → Ajoute prestations + matériaux (catalogue fournisseur pgvector optionnel)
    → Envoie au client (statut: sent)
    → Client accepte (RPC client_accept_quote) ou refuse
    → Si accepté : conversion en facture (standard, acompte, situation, solde…)
    → Finalisation (Factur-X B2B ou PDF + e-reporting B2C)
    → Paiement Stripe Checkout (optionnel)
    → Relances automatiques si impayé (cron)
    → Recouvrement LRAR puis RubyPayeur si nécessaire
```

Fichiers clés : `src/app/app/quotes/`, `src/lib/billing/invoicing/invoice-service.ts`.

### Cycle de vie d'un rendez-vous

```
Prospect sur vitrine / widget / (vocal en pause)
    → Créneau proposé selon disponibilités artisan
    → RDV créé (pending ou confirmed)
    → Si prospect sans compte : pending_vitrine_appointments
    → À l'inscription client : finalisation automatique du RDV
```

### Cycle de vie d'un lead (tunnel estimation)

```
1. Prospect choisit un métier (~100 métiers BTP, taxonomy.ts)
2. Chat IA qualification (questions séquentielles)
3. Localisation (API BAN ou géolocalisation navigateur)
4. Upload photos/vidéos (bucket privé lead-media)
5. Qualification IA → JSON structuré (urgence, complexité, fourchette prix)
6. Matching géographique : 2-3 artisans dans ~40 km (RPC match_leads_to_artisans)
7. Prospect saisit coordonnées (nom, email, téléphone)
8. Dispatch automatique (dispatchLeadToArtisans) :
   - Conversation artisan ↔ lead
   - Message récap + pièces jointes
   - Brouillon de devis pré-rempli
9. Suivi via token : /estimation/suivi
10. Conversion : prospect s'inscrit → claim_lead
```

Fichiers clés : `src/app/estimation/`, `src/lib/leads/dispatch-lead.ts`, `src/lib/ai/qualify-lead.ts`.

---

## 8. Intelligence artificielle

**Fournisseur** : Mistral AI (`src/lib/ai/mistral.ts`)

| Usage | Modèle | Endpoint / fichier |
|-------|--------|-------------------|
| Chat général (assistant, leads, devis) | `open-mistral-nemo` (surchargeable `MISTRAL_CHAT_MODEL`) | `/api/ai/assistant` |
| Embeddings catalogue matériaux | `mistral-embed` (1024 dims) | `src/lib/ai/embeddings.ts` |
| Qualification lead | JSON structuré (Zod + Mistral) | `/api/ai/qualify-lead` |
| Brouillon devis depuis texte | Matching pgvector matériaux | `/api/ai/generate-quote-from-chat` |

### Assistant artisan (`POST /api/ai/assistant`)

- Compréhension d'intentions : navigation, questions RDV/devis/factures en attente
- Création de RDV en langage naturel
- Brouillon de devis depuis dictée ou texte (mode mains libres dans le FAB)
- **Fast-paths déterministes** (`assistant-fast-path.ts`) pour réponses instantanées sans appel LLM
- Requêtes données métier (`assistant-data-query.ts`)

### Catalogue matériaux vectorisé

Table `supplier_products` avec `embedding vector(1024)`. RPC `match_supplier_products` pour similarité cosinus lors de la génération de devis. Script seed : `scripts/seed-supplier-embeddings.ts`.

---

## 9. Secrétariat vocal Soline

**Soline** est l'agent vocal qui répond aux appels des clients de l'artisan, 24h/24. L'agent est hébergé chez **ElevenLabs** ; il interroge l'application via des **tools REST** authentifiés.

### Architecture

```
Appel entrant (Twilio, numéro E.164 de l'artisan)
    → Agent vocal ElevenLabs
    → Tools REST Soline (Bearer VOICE_AI_TOOL_SECRET)
        POST /api/voice/artisan/quota-status     — quota avant acceptation
        POST /api/voice/artisan/create-quote-draft — résumé + brouillon devis
        POST /api/voice/artisan/availability     — créneaux libres
        POST /api/voice/artisan/appointment-info   — info RDV existant
        POST /api/voice/artisan/schedule           — désactivé (RDV vocal en pause)
    → Artisan valide dans /app/appels
    → Webhook Twilio POST /api/webhooks/twilio/status
    → Journal voice_call_logs + décompte minutes
```

Table `artisan_voice_numbers` : association numéro E.164 ↔ artisan.

### Quota vocal (mois civil)

| Plan | Minutes incluses/mois |
|------|----------------------|
| Base | 0 |
| Pro | 60 |
| Premium | 150 |

- Décompte **dérivé** du mois civil depuis `voice_call_logs` — pas de compteur cumulatif à remettre à zéro (`src/lib/voice/resolve-voice-quota.ts`).
- Préférence `profiles.voice_allow_overage` : cochée = minutes supplémentaires refacturables ; décochée = refus des appels hors quota.
- Règle facturation : `Math.ceil(CallDuration / 60)` minutes si statut `completed`.
- Recharges : Pack 60 min (39 € HT), Pack 150 min (79 € HT).

---

## 10. Facturation, conformité et paiements

### Devis

- Statuts : `draft`, `sent`, `accepted`, `rejected`
- Lignes : `quote_services`, `quote_materials`
- Lien public : token `public_token` → `/devis/[token]`
- Export PDF : `GET /api/quotes/[quoteId]/pdf`
- Attestation TVA réduite BTP : `GET /api/quotes/[quoteId]/vat-attestation`

### Factures BTP

Types : `standard`, `deposit` (acompte), `progress` (situation), `final` (solde), `credit_note` (avoir). Plusieurs factures peuvent être rattachées à un même devis accepté.

### Pipeline de finalisation (`InvoiceService`)

```
Chargement document BDD
    → Classification client B2B vs B2C (SIREN + TVA)
    → B2B :
        Génération Factur-X (XML CII EN16931 + PDF/A-3)
        Soumission Plateforme Agréée (PA_PROVIDER)
        Suivi statuts via webhooks PA
    → B2C :
        PDF simple
        Enqueue e_reporting_queue
        Cron quotidien /api/cron/e-reporting → transmission PA
```

Fichiers : `src/lib/billing/facturx/` (build-cii-invoice, generate-factur-x, validate-factur-x, render-invoice-pdf).

### Paiements Stripe

- **Stripe Connect Express** : onboarding artisan pour encaissement direct sur ses factures.
- **Stripe Checkout** : paiement facture côté client (`/compte/factures/[invoiceId]`).
- **Stripe Billing** : abonnements SaaS (webhook sync `subscription_status`, essai 15 jours).
- Webhook : `POST /api/webhooks/stripe`.

### Relances impayés

Cron quotidien `0 7 * * *` → `/api/cron/invoice-reminders`. Relance manuelle possible depuis l'UI facture.

---

## 11. Recouvrement des impayés

Pipeline piloté par `invoices.recovery_status` :

`none` → `formal_notice_sent` → `submitted_to_collection` → `in_progress` → `collected` | `failed`

### Phase 1 — Mise en demeure LRAR (J+30)

- PDF généré (`render-formal-notice-pdf.ts`) : principal + pénalités + indemnité 40 € B2B.
- Envoi recommandé AR via **MySendingBox** (La Poste).
- Webhook `POST /api/webhooks/mysendingbox` : suivi acheminement, preuves archivées dans bucket `recovery-documents`.

**Quota LRAR** : 1 recommandé/mois civil inclus par plan, **non cumulable**. Compteur dérivé des `formal_notices` réellement affranchies (`mysendingbox_letter_id`). Au-delà : consentement `acceptExtraCost: true` dans l'UI avant surcoût.

### Phase 2 — Recouvrement contentieux (J+40)

- Transmission dossier à **RubyPayeur** sous mandat artisan (no cure, no pay).
- Pièces : facture, devis signé, mise en demeure, preuves La Poste (URLs signées).
- Webhook `POST /api/webhooks/rubypayeur` (HMAC-SHA256) : encaissement, rétrocession partenaire (`RUBYPAYEUR_COMMISSION_RATE`, 20 % par défaut).

UI : `src/components/recovery/` (FormalNoticeCard, RecoveryCollectionModal). Actions : `src/app/app/invoices/recovery-actions.ts`.

---

## 12. Tunnel de leads et acquisition

### Widget embed

Script `public/embed.js` injectable sur tout site :

```javascript
window.Soline.open();
window.Soline.close();
window.Soline.toggle();
```

Configuration dans `/app/reglages` (snippet + prévisualisation).

### Taxonomie métiers BTP

`src/lib/trades/taxonomy.ts` : ~15 catégories, ~100 métiers. Utilisée pour filtrage, matching, thème vitrine.

### Matching géographique

RPC `match_leads_to_artisans` : 2-3 artisans dans un rayon configurable (~40 km), algorithme haversine via `search_artisans_nearby`.

### Sécurité

- Accès lead par **token porteur** (pas de session requise).
- Bucket `lead-media` privé, RLS stricte.
- Dispatch **idempotent** : rejeu sans duplication des matchs déjà dispatchés.

---

## 13. Modèle économique

Source : `src/lib/billing/subscription-plans.ts`

### Abonnements HT

| Plan | Mensuel | Annuel | Soline (min/mois) | LRAR/mois |
|------|---------|--------|-------------------|-----------|
| **Base** | 44,90 € | 449,90 € | 0 | 1 |
| **Pro** | 69,90 € | 699,90 € | 60 | 1 |
| **Premium** | 99,90 € | 999,90 € | 150 | 1 |

Le SaaS BTP (devis, factures, RDV, messagerie, vitrine, recouvrement) est identique sur les trois formules. Seule la **secrétaire vocale Soline** diffère.

- Essai gratuit **15 jours** (`TRIAL_DURATION_DAYS`).
- LRAR supplémentaire : refacturé au tarif La Poste, sans marge, avec consentement artisan.

---

## 14. Base de données et migrations

Schéma complet : `supabase/init.sql` (idempotent, rejouable).

Migrations incrémentales dans `supabase/migration/` :

| Fichier | Contenu |
|---------|---------|
| `01_voice_quota.sql` | Quota vocal, `voice_call_logs`, RPC Twilio |
| `02_platform_admin.sql` | `platform_admins`, statuts compte, suspension |
| `03_trial_subscription.sql` | Essai 15j, IDs Stripe Billing |
| `04_work_library.sql` | Catalogue ouvrages pré-chiffrés |
| `05_btp_invoicing.sql` | TVA réduite, factures acompte/situation/solde/avoir |
| `06_retake_gaps.sql` | Mentions légales, lien public devis, chantiers, BI, fournisseurs |
| `07_stripe_billing_events.sql` | Journal événements Stripe Billing |
| `08_voice_call_intakes.sql` | Intakes appels (résumé + brouillon à valider) |
| `09_e_invoicing_invoice.sql` | Colonnes e-facturation sur invoices |
| `10_e_reporting_worker.sql` | File `e_reporting_queue` |
| `11_recovery_and_legal_notices.sql` | Recouvrement, `formal_notices`, `debt_collection_cases`, bucket recovery |
| `12_voice_quota_civil_month.sql` | Quota vocal mois civil, `voice_allow_overage` |

### Tables métier principales

`profiles`, `services`, `appointments`, `quotes`, `quote_services`, `quote_materials`, `invoices`, `invoice_lines`, `conversations`, `messages`, `leads`, `lead_media`, `lead_matches`, `supplier_products`, `voice_call_logs`, `formal_notices`, `debt_collection_cases`, `e_reporting_queue`, `platform_admins`.

### Extensions PostgreSQL

- `pgcrypto` — tokens, UUID
- `vector` (pgvector) — recherche similarité catalogue matériaux

### Storage Supabase

| Bucket | Usage | Accès |
|--------|-------|-------|
| `lead-media` | Photos/vidéos leads | Privé, RLS |
| `recovery-documents` | Mises en demeure, preuves La Poste | Privé, URLs signées serveur |

---

## 15. API, webhooks et crons

### Routes IA et estimation

| Méthode | Route |
|---------|-------|
| POST | `/api/ai/assistant` |
| POST | `/api/ai/qualify-lead` |
| POST | `/api/ai/generate-quote-from-chat` |
| POST | `/api/ai/suggest-reply` |
| POST | `/api/ai/suggest-quote-notes` |
| POST | `/api/ai/summarize-quote` |
| POST | `/api/estimation/chat` |

### Documents

| Méthode | Route |
|---------|-------|
| GET | `/api/quotes/[quoteId]/pdf` |
| GET | `/api/quotes/[quoteId]/vat-attestation` |
| GET | `/api/invoices/[invoiceId]/pdf` |
| GET | `/api/invoices/[invoiceId]/factur-x` |
| GET | `/api/invoices/export-accounting` |

### Voice (Bearer `VOICE_AI_TOOL_SECRET`)

| Méthode | Route |
|---------|-------|
| POST | `/api/voice/artisan/create-quote-draft` |
| POST | `/api/voice/artisan/quota-status` |
| POST | `/api/voice/artisan/availability` |
| POST | `/api/voice/artisan/appointment-info` |
| POST | `/api/voice/artisan/schedule` *(désactivé)* |

### Webhooks

| Route | Auth | Rôle |
|-------|------|------|
| `/api/webhooks/stripe` | Signature Stripe | Abo SaaS, Connect, paiement factures |
| `/api/webhooks/twilio/status` | Signature Twilio | Journal appels + minutes |
| `/api/webhooks/facturation-electronique` | `x-pa-signature` | Callbacks Plateforme Agréée |
| `/api/webhooks/mysendingbox` | Secret partagé | Suivi LRAR |
| `/api/webhooks/rubypayeur` | HMAC-SHA256 | Cycle recouvrement |

### Crons Vercel (`vercel.json`)

| Schedule (UTC) | Route | Rôle |
|----------------|-------|------|
| `0 7 * * *` | `/api/cron/invoice-reminders` | Relances impayés |
| `0 3 * * *` | `/api/cron/e-reporting` | Transmission e-reporting B2C |

Auth : `Authorization: Bearer ${CRON_SECRET}`.

---

## 16. Variables d'environnement

Copier `.env.example` vers `.env` et renseigner les valeurs.

### Supabase & app

| Variable | Usage |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Opérations admin / webhooks / crons |
| `NEXT_PUBLIC_SITE_URL` | URL app (`https://app.solinebtp.fr`) |
| `NEXT_PUBLIC_MARKETING_URL` | URL marketing (`https://solinebtp.fr`) |
| `CRON_SECRET` | Protection routes `/api/cron/*` |

### IA & voix

| Variable | Usage |
|----------|-------|
| `MISTRAL_API_KEY` | API Mistral |
| `MISTRAL_CHAT_MODEL` | Surcharge modèle chat (optionnel) |
| `MISTRAL_VISION_MODEL` | Modèle vision (prévu) |
| `VOICE_AI_TOOL_SECRET` | Auth tools vocaux ElevenLabs |
| `TWILIO_AUTH_TOKEN` | Validation signature webhooks Twilio |
| `TWILIO_STATUS_CALLBACK_URL` | Callback explicite (optionnel) |

### Facturation électronique

| Variable | Usage |
|----------|-------|
| `PA_PROVIDER` | `noop`, `pennylane`, `http`, `docaposte`, `confactura` |
| `PA_API_KEY`, `PA_API_URL`, `PA_WEBHOOK_SECRET` | Plateforme Agréée B2B |
| `E_REPORTING_PROVIDER`, `E_REPORTING_API_URL`, `E_REPORTING_API_KEY` | E-reporting B2C |
| `FACTURX_SKIP_*` | Désactiver validations (dev) |

### Recouvrement

| Variable | Usage |
|----------|-------|
| `MYSENDINGBOX_API_KEY`, `MYSENDINGBOX_WEBHOOK_SECRET` | LRAR papier |
| `RUBYPAYEUR_*` | Dossiers contentieux + commission partenaire |

### Stripe

| Variable | Usage |
|----------|-------|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Paiements et abonnements |
| `STRIPE_PAYMENT_LINK_*` | Liens Payment Link par plan (6 variables) |

### Email (utilisé dans le code)

| Variable | Usage |
|----------|-------|
| `RESEND_API_KEY`, `EMAIL_FROM` | Envoi emails transactionnels |

---

## 17. Développement local

### Prérequis

- **Node.js 24.x** (voir `.nvmrc`)
- Projet Supabase configuré (exécuter `init.sql` + migrations)
- Fichier `.env` renseigné

### Commandes

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # Build production
npm run test     # Vitest
npm run lint     # ESLint
```

Sans Supabase configuré, la landing et certaines pages de démo restent accessibles (le middleware dégrade gracieusement).

### Appliquer les migrations Supabase

Exécuter dans l'ordre : `supabase/init.sql` (si base vierge), puis `supabase/migration/01` à `12` dans le SQL Editor Supabase.

---

## 18. Déploiement (Vercel)

| Paramètre | Valeur |
|-----------|--------|
| Framework | Next.js (auto-détecté) |
| Node.js | **24.x** (`engines` + réglage projet) |
| Build | `npm run build` (défaut) |
| Crons | `vercel.json` (2 jobs, compatible Hobby) |
| BDD | Supabase (UE), indépendante de Vercel |

### Plan Hobby — contraintes importantes

- **Une seule région** pour les fonctions serverless. Ne pas sélectionner plusieurs régions (ex. Paris + Washington) : le build peut réussir puis échouer silencieusement à « Deploying outputs… » avec *internal Vercel error*. Recommandation : **Paris (cdg1)** pour des utilisateurs français.
- **2 crons max**, chacun 1×/jour — la configuration actuelle est conforme.
- Appliquer les migrations Supabase **avant** d'activer les fonctionnalités recouvrement / e-reporting / quota vocal en prod.

### Checklist post-déploiement

1. Variables d'environnement production sur Vercel (toutes les sections ci-dessus).
2. `NEXT_PUBLIC_SITE_URL` = `https://app.solinebtp.fr`
3. Webhooks Stripe, Twilio, MySendingBox, RubyPayeur, PA pointés vers les URLs prod.
4. Migrations Supabase 10, 11, 12 appliquées si pas encore fait.

---

## 19. Résumé — ce que fait Soline

**Soline, c'est le bureau digital complet de l'artisan du bâtiment — avec une secrétaire IA qui ne dort jamais.**

Imaginez un plombier, un couvreur ou un électricien qui passe ses journées sur les chantiers. Le téléphone sonne, les devis traînent, les relances s'accumulent, et la facturation électronique — désormais obligatoire — paraît incompréhensible. Soline remplace cette pile d'outils dispersés (Excel, WhatsApp, agenda papier, logiciel comptable) par **une seule application**, accessible depuis le téléphone comme depuis un ordinateur.

### Pour l'artisan : tout son activité au même endroit

Depuis **app.solinebtp.fr**, l'artisan gère l'intégralité de son activité :

- Il **crée des devis en quelques minutes**, à la main, en dictant à l'assistant IA, ou même depuis un **appel téléphonique** que Soline (sa secrétaire vocale) a pris en son absence.
- Il **envoie le devis au client** par lien ; dès que le client accepte, la **facture** se génère — conforme à la loi, au format **Factur-X** pour les professionnels, avec transmission automatique à la **Plateforme Agréée**.
- Il **planifie ses rendez-vous**, échange par **messagerie** avec ses clients, et consulte son **planning** en un coup d'œil.
- Il dispose d'une **vitrine en ligne** (`/site/[slug]`) et d'un **widget** à coller sur son site existant pour recevoir des demandes de devis directement.
- Si une facture impayée traîne, Soline enclenche un **pipeline de recouvrement** : mise en demeure **LRAR** envoyée par La Poste (1 recommandé offert par mois), puis, si besoin, transmission à un **cabinet de recouvrement** partenaire — le tout piloté depuis la fiche facture, sans courrier à imprimer ni recommandé à affranchir à la main.

### Pour le client final : simplicité et transparence

Le client accède à son espace **/compte** : il consulte ses devis, les **accepte ou refuse en un clic**, paie ses factures par **carte bancaire** (Stripe), prend rendez-vous et échange avec son artisan par message. Il peut aussi **rechercher un artisan** près de chez lui par métier.

### Pour le prospect : zéro friction à l'entrée

Un particulier qui a un problème de toiture ou de plomberie n'a pas besoin de créer un compte pour commencer. Sur **solinebtp.fr/estimation**, il décrit son besoin en **chat avec l'IA**, indique où il habite, envoie des photos — et reçoit une **fourchette de prix indicative**. Soline **qualifie** la demande, **géolocalise** le prospect, et **dispatch automatiquement** son dossier vers 2 ou 3 artisans compatibles : conversation ouverte, photos transmises, **brouillon de devis déjà pré-rempli**. L'artisan n'a plus qu'à ajuster et envoyer.

### Soline, la secrétaire vocale (plans Pro et Premium)

Quand l'artisan est sur un échafaudage et ne peut pas décrocher, **Soline répond à sa place**. Branchée sur le numéro de l'artisan (Twilio), l'agent vocal (ElevenLabs) accueille l'appelant, comprend la demande, et peut **proposer un brouillon de devis** que l'artisan valide ensuite depuis son téléphone. Chaque plan inclut un **quota de minutes** ; au-delà, l'artisan choisit s'il accepte la facturation supplémentaire ou s'il préfère couper les appels.

### Conformité et sérénité administrative

Soline intègre nativement les exigences de la **facturation électronique française** : Factur-X, e-invoicing B2B, e-reporting B2C, relances automatiques des impayés. L'artisan n'a pas à choisir entre « outil métier » et « conformité légale » — les deux sont dans le même flux.

### Les formules

| | Base | Pro | Premium |
|---|------|-----|---------|
| **Prix mensuel HT** | 44,90 € | 69,90 € | 99,90 € |
| **SaaS complet** | ✓ | ✓ | ✓ |
| **Recouvrement LRAR** | 1/mois | 1/mois | 1/mois |
| **Soline (min/mois)** | — | 60 min | 150 min |

**15 jours d'essai gratuit** pour tester sans engagement.

---

**En une phrase :** Soline transforme l'artisan du BTP en entreprise digitalisée — il reçoit des leads qualifiés, répond par la voix ou le chat, convertit en devis signés, facture conformément à la loi, relance et recouvre les impayés, le tout depuis une application unique, avec une secrétaire IA disponible 24h/24.

---

*Document mis à jour — septembre 2026. Dépôt : OrbitArtisan / Produit : Soline / AlphaSysAI.*
