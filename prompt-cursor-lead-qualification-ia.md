# Prompt Cursor — Widget IA de pré-qualification & mise en relation client

Copie tout ce qui suit dans Cursor (Agent mode / Composer), idéalement en plusieurs passes (Phase 0 puis Phase 1, etc.) plutôt qu'en une seule fois.

---

## Contexte projet (à ne pas re-générer, à réutiliser)

Tu travailles sur **OrbitArtisan**, une app Next.js 16 (App Router, React 19, TypeScript) avec Supabase (Postgres + Auth + RLS + pgvector), Tailwind v4 + shadcn/ui, Stripe (actuellement Connect Express pour les virements artisans, pas d'abonnement SaaS), et Mistral AI via `src/lib/ai/mistral.ts` (`mistralChat`, modèle par défaut `open-mistral-nemo`, texte uniquement — pas de vision pour l'instant).

Le produit a déjà deux côtés :
- **Côté artisan** : `/app/*` (contacts, devis, factures, rdv, messages, services, réglages), assistant IA interne (`src/app/api/ai/assistant`), génération de devis depuis une conversation (`src/app/api/ai/generate-quote-from-chat`, `src/lib/ai/build-quote-from-text.ts`, `src/lib/ai/quote-from-chat-schema.ts`).
- **Côté client** : `/compte/*` (contacts, factures, messages, réglages), inscription (`/inscription-client`), recherche d'artisan géolocalisée (`/compte/recherche`), et une **vitrine publique par artisan** (`/site/[slug]`, composants dans `src/components/vitrine/`) qui a déjà : liste de services + prix, prise de RDV (`book-appointment-form.tsx`), et un chat client↔artisan (`vitrine-messages.tsx`).

Briques existantes à réutiliser telles quelles, ne pas les recréer :
- Géocodage : `src/lib/geo/ban.ts` (API BAN).
- Taxonomie métiers : `src/lib/trades/taxonomy.ts`.
- Recherche d'artisans à proximité : RPC Postgres `search_artisans_nearby` + `src/app/compte/recherche/actions.ts` (filtre par métier + rayon en km).
- Conversations/messages : tables `conversations`/`messages` + `src/lib/messages/actions.ts`.
- Génération de brouillon de devis depuis un échange texte : pattern complet dans `src/app/api/ai/generate-quote-from-chat/route.ts` + `src/lib/ai/quote-draft-storage.ts` (type `AiQuoteDraft` réutilisé ensuite dans `/app/quotes/new`).
- Tarifs artisan existants : `services.price`, `services.duration`, `profiles.labor_rate_per_hour` (pas de "grille tarifaire" globale par métier aujourd'hui — voir décisions ouvertes).
- Invitations pour transformer un prospect anonyme en compte client : `platform_invitations` (table + policies RLS, `src/app/invitation/[token]/page.tsx`). Le lien `client_invitations` est **déprécié**, ne pas l'utiliser.
- PWA déjà scaffoldée (`src/lib/pwa`, icônes dans `src/app/pwa-icons`) — pas d'app mobile native, on reste sur le web.

## Objectif de cette fonctionnalité

Créer un tunnel de **pré-qualification par chatbot IA**, sans compte obligatoire, accessible :
1. via un lien/QR code (page OrbitArtisan publique, non liée à un artisan précis au départ),
2. et en **widget embarquable** sur le site vitrine existant d'un artisan (pour le cold-start : chaque artisan peut poser ce même chatbot sur son propre site externe).

Le client décrit son besoin, envoie 2-3 photos ou une courte vidéo, reçoit une **fourchette de prix indicative**, puis est mis en relation avec **2 à 3 artisans maximum** (jamais plus, pas de logique d'enchères). Côté artisan, la demande arrive comme un lead qualifié (photos + description + budget + localisation) et se convertit en **brouillon de devis pré-rempli** en un clic.

## Ce qu'il faut construire

### Phase 0 — Modèle de données (Supabase)
Créer un nouveau fichier `supabase/lead_qualification.sql` (suivre le style des scripts existants : idempotent, `create table if not exists`, RLS activée avec policies) :

- Table `leads` : `id`, `source` (`enum: 'direct' | 'artisan_widget'`), `origin_artisan_id` (nullable, artisan dont le widget a généré le lead — pour le cold-start), `trade_category`, `trade`, `description` (texte libre du client), `lat`/`lng`/`address_label` (via BAN), `status` (`enum: 'new' | 'estimated' | 'matched' | 'converted' | 'expired'`), `estimate_min`, `estimate_max`, `contact_name`, `contact_email`, `contact_phone` (nullable tant que non converti en compte), `claimed_by_user_id` (nullable, rempli si le client crée/relie un compte), timestamps.
- Table `lead_media` : `id`, `lead_id`, `storage_path`, `kind` (`'photo' | 'video'`), `created_at`.
- Table `lead_matches` : `id`, `lead_id`, `artisan_id`, `distance_km`, `rank` (1 à 3), `conversation_id` (nullable, rempli une fois le lead envoyé en message), `quote_draft_created` (bool), `created_at`.
- Policies RLS : insertion publique (anon) sur `leads`/`lead_media` limitée aux colonnes autorisées (via une fonction/RPC `security definer`, pas d'insert direct anon sur la table si possible), lecture restreinte à l'artisan matché (`lead_matches.artisan_id = profile courant`) et au client une fois `claimed_by_user_id` rempli.
- Bucket Supabase Storage `lead-media` (privé), avec policy d'upload signé côté client anonyme (URL signée générée server-side, pas de clé exposée).

**Décision à valider avec moi avant de coder** : il n'existe aujourd'hui aucune notion d'abonnement SaaS actif (`profiles` n'a que des champs Stripe Connect pour les virements). Pour le MVP, proposer soit (a) un champ `profiles.lead_matching_enabled boolean default true` que l'artisan peut désactiver dans ses réglages, soit (b) brancher plus tard sur une vraie table `subscriptions`. Me demander confirmation avant d'implémenter l'un ou l'autre.

### Phase 1 — Chat de qualification (front)
Nouvelle route publique `/estimation` (pas d'auth requise) :
- Étape 1 : sélection du métier via `TRADE_DOMAINS`/`categoriesForDomain` de `src/lib/trades/taxonomy.ts` (même composant que `recherche-client.tsx`, à factoriser si pertinent).
- Étape 2 : chat guidé (questions IA type "où se situe la fuite ?", "depuis quand ?", etc.) + champ description libre.
- Étape 3 : upload de 2-3 photos ou une courte vidéo (drag & drop + capture mobile `<input capture>`), upload direct vers le bucket `lead-media` via URL signée.
- Étape 4 : localisation (géoloc navigateur ou saisie manuelle, réutiliser `src/lib/geo/ban.ts` comme dans `recherche-client.tsx`).
- Étape 5 : affichage de la fourchette indicative + les 2-3 artisans proposés (nom, distance, avis si dispo, bouton "Envoyer ma demande").
- Formulaire de contact minimal (nom + email ou téléphone) seulement à la toute fin, une fois la fourchette acceptée — pas de compte obligatoire à ce stade.

Design mobile-first, mêmes composants shadcn/ui que le reste de l'app (`src/components/ui`), cohérent avec `vitrine-public-page.tsx`.

### Phase 2 — Widget embarquable (pour le cold-start artisan)
- Route `/site/[slug]/widget` (ou `/embed/[slug]`) : version allégée de l'étape chat ci-dessus, pré-filtrée sur l'artisan propriétaire du slug (mais qui peut quand même proposer 1-2 confrères en complément si le créneau ne colle pas — à discuter).
- Fichier statique `public/embed.js` : petit script loader que l'artisan colle sur son site externe (`<script src="https://orbitartisan.com/embed.js" data-artisan="slug"></script>`), qui injecte un `<iframe>` + bouton flottant, avec `postMessage` pour l'auto-resize.
- Vérifier/adapter les headers (`X-Frame-Options` / CSP `frame-ancestors`) pour autoriser l'iframe cross-origin uniquement sur cette route précise.

### Phase 3 — API de qualification IA
Nouvelle route `src/app/api/ai/qualify-lead/route.ts`, sur le modèle de `generate-quote-from-chat/route.ts` :
- Reçoit la conversation du chat + description + métier.
- Appelle `mistralChat` (comme dans `src/lib/ai/build-quote-from-text.ts`) pour extraire : nature du besoin, urgence, éléments techniques, et une estimation de temps/complexité.
- Croise avec les tarifs des artisans candidats dans le rayon (moyenne des `services.price`/`labor_rate_per_hour` des artisans matchés, ou grille de référence par métier si on en construit une) pour produire `estimate_min`/`estimate_max`.
- **Décision à valider avec moi** : le modèle Mistral actuellement utilisé (`open-mistral-nemo`) ne fait pas d'analyse d'image. Deux options : (a) MVP — les photos ne sont pas analysées par l'IA, juste jointes au lead pour l'artisan ; (b) passer sur un modèle vision Mistral (ex. `pixtral-12b` ou équivalent dispo sur l'API Mistral) pour extraire des infos des photos. Me proposer les deux et attendre mon choix avant d'implémenter l'option (b).

### Phase 4 — Matching + envoi au(x) artisan(s)
- Réutiliser la RPC `search_artisans_nearby` (filtrer sur `lead_matching_enabled = true`), trier par distance (+ note si un système d'avis existe déjà — vérifier avant de le supposer), garder strictement 2 à 3 résultats.
- Pour chaque artisan matché : créer une `conversation` + un premier `message` récapitulant le lead (description, photos en pièce jointe — vérifier si le schéma `messages` gère déjà des pièces jointes, sinon l'ajouter), et une ligne `lead_matches`.
- Générer automatiquement un `AiQuoteDraft` (réutiliser `src/lib/ai/quote-draft-storage.ts` et le mapping de `generate-quote-from-chat`) visible depuis `/app/quotes/new` côté artisan avec un bandeau "Généré depuis une demande qualifiée IA — estimation indicative, à confirmer après visite/diagnostic". L'artisan clique "Valider et envoyer" pour transformer en vrai devis (flux existant, ne pas le modifier).

### Phase 5 — Conversion du lead en compte client
- Une fois le lead envoyé, proposer au client de créer un compte (réutiliser `platform_invitations` + `/inscription-client`) pour suivre l'échange dans `/compte/messages`. Ne jamais bloquer l'envoi du lead sur la création de compte.

## Contraintes non négociables (garde-fous produit)

- Toujours afficher "estimation indicative, non engageante" — jamais "devis" côté client tant que l'artisan n'a pas validé lui-même.
- Jamais plus de 2-3 artisans proposés par lead. Pas de mode liste/enchères.
- Aucune app mobile native : tout doit rester accessible en web/PWA depuis un simple lien ou QR code, sans installation obligatoire.
- Le widget embarqué sur le site d'un artisan tiers doit rester utilisable même si l'artisan n'a pas (encore) de compte OrbitArtisan actif — dans ce cas, capturer le lead et l'inviter à s'inscrire plutôt que de bloquer le client (à confirmer avec moi comme comportement voulu).

## Méthode de travail attendue

Avant de coder, liste-moi les fichiers exacts que tu vas créer/modifier par phase, et pose-moi les questions ouvertes listées ci-dessus (subscription flag, vision IA, pièces jointes messages, comportement widget sans compte actif). Implémente phase par phase, avec `npm run lint` après chaque phase.
