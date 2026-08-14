# Prompt Cursor — Analyse IA des photos jointes au lead (option vision)

Copie ce prompt dans Cursor. Le tunnel `/estimation` et `/embed/[slug]` existent déjà et fonctionnent en texte seul (`qualifyLead` dans `src/lib/ai/qualify-lead.ts` ignore volontairement les photos aujourd'hui — le commentaire dit explicitement "le modèle de chat n'a pas de vision"). L'objectif est de lui donner cette capacité, sans casser le flux existant.

## Contexte technique exact (vérifié dans le repo)

- `src/lib/ai/mistral.ts` : `MistralChatMessage.content` est typé `string` uniquement. `mistralChat`/`mistralChatParse` envoient ce message tel quel à `POST /v1/chat/completions`. Il faut élargir ce type pour accepter des blocs multimodaux, sans casser les appels existants (assistant artisan, generate-quote-from-chat, etc. qui n'envoient que du texte).
- `qualifyLead()` (`src/lib/ai/qualify-lead.ts`) est appelée à deux endroits : `computeLeadEstimate()` dans `src/app/estimation/actions.ts` (flux réel du tunnel `/estimation` et `/embed/[slug]`, server action) et `src/app/api/ai/qualify-lead/route.ts` (route API, semble utilisée pour prévisualiser/tester — vérifier si un composant l'appelle réellement avant de la modifier en double).
- Les photos sont dans le bucket privé Supabase `lead-media` (`LEAD_MEDIA_BUCKET` dans `src/lib/leads/types.ts`), chemin `<lead_id>/<uuid>.<ext>`, déclarées dans la table `lead_media` (`kind: 'photo' | 'video'`) via la RPC `add_lead_media`. Le bucket accepte `image/jpeg, image/png, image/webp, image/heic, video/mp4, video/quicktime` (voir `supabase/lead_qualification.sql`, section bucket storage).
- **Aucune policy RLS `anon` de lecture** sur `storage.objects` pour ce bucket : seule `authenticated` + `can_access_lead()` peut lire (policy `lead_media_objects_read`), plus une policy dédiée pour l'artisan matché (`lead_media_artisan_read` dans `supabase/lead_dispatch.sql`). Le tunnel `/estimation` tourne sans session (prospect anonyme) : pour lire les photos côté serveur au moment de la qualification IA, il faut un **client Supabase service role**, sur le modèle de `src/lib/leads/dispatch-lead.ts` (qui utilise déjà `SUPABASE_SERVICE_ROLE_KEY` pour contourner la RLS). Réutiliser exactement ce pattern, pas un nouveau.
- Schéma de sortie actuel : `src/lib/ai/qualify-lead-schema.ts` (`LeadQualificationSchema` + `LEAD_QUALIFICATION_JSON_SCHEMA` + `LEAD_QUALIFICATION_JSON_EXAMPLE`). Le récap envoyé à l'artisan est construit par `buildLeadRecapMessage()` dans `src/lib/leads/lead-recap-message.ts`.

## Ce qu'il faut construire

### 1. Support multimodal dans le client Mistral
Dans `src/lib/ai/mistral.ts` :
- Étendre `MistralChatMessage.content` en `string | MistralContentBlock[]`, avec `MistralContentBlock = { type: "text"; text: string } | { type: "image_url"; image_url: string }` (c'est le format exact de l'API Mistral — un objet `content` en tableau, `image_url` en `string` — soit une URL, soit une data URI base64 `data:image/jpeg;base64,...`).
- Ne rien changer au comportement pour les appels texte existants (le type `string` doit rester valide partout ailleurs).

### 2. Modèle vision — point d'attention important
Le modèle par défaut actuel (`open-mistral-nemo`, texte seul) ne convient pas. **Ne code pas en dur un nom de modèle vision sans vérifier d'abord sur https://docs.mistral.ai/getting-started/models/ quel est le modèle vision actuellement disponible** : Pixtral 12B (`pixtral-12b-2409`) est déprécié depuis le 2 décembre 2025 (retrait le 31/12/2025), remplacé par la famille **Ministral 3** (vision "budget"). Pixtral Large est déprécié depuis le 27 février 2026, remplacé par **Mistral Large 3**. Utilise le nom de modèle exact confirmé dans la doc au moment où tu codes, pas une supposition.
- Ajouter `MISTRAL_VISION_MODEL` (env var, même pattern que `MISTRAL_CHAT_MODEL`), avec un commentaire explicite renvoyant vers la doc pour vérifier le slug avant déploiement.
- Un modèle vision "budget" suffit largement ici (pas besoin de raisonnement complexe, juste décrire ce qui est visible sur une photo de plomberie/électricité/etc.) — privilégier le moins cher des modèles vision disponibles, sauf si les tests de qualité montrent l'inverse.

### 3. Récupération et préparation des photos (nouveau fichier `src/lib/leads/lead-media-vision.ts`)
- Client Supabase **service role** (copier le pattern de `dispatch-lead.ts`, ne pas en inventer un autre).
- Charger les lignes `lead_media` du lead où `kind = 'photo'` uniquement (ignorer les vidéos dans cette passe — pas d'extraction de frame prévue).
- Limiter à 3 photos maximum (coût/latence) — si plus de 3 sont jointes, prendre les 3 premières par `created_at`.
- Télécharger chaque fichier (`supabase.storage.from(bucket).download(path)`), pas de signed URL passée à Mistral — on encode en base64 côté serveur pour rester en flux serveur-à-serveur.
- **Point d'attention HEIC** : le bucket accepte `image/heic` (photos iPhone), mais les modèles vision Mistral ne prennent en entrée que des formats image web standards (jpeg/png/webp). Convertir tout HEIC en JPEG avant l'envoi. Ajouter une dépendance de conversion (`sharp` avec support HEIF, ou une lib dédiée type `heic-convert` si `sharp` ne suffit pas dans l'environnement de déploiement — vérifier que `libvips` embarqué supporte HEIF, sinon utiliser `heic-convert`). Profiter du passage par `sharp` pour aussi redimensionner (max ~1024 px sur le plus grand côté, qualité JPEG ~80) : ça réduit le coût en tokens et la latence sans perdre l'info utile pour l'IA.
- Retourner un tableau de blocs `image_url` (data URI base64) prêt à injecter dans le message utilisateur, plus un flag `mediaAnalyzed: boolean` (false si aucune photo exploitable, ou si le téléchargement/la conversion échoue sur toutes les images — dans ce cas fallback silencieux vers le comportement texte-only actuel, ne jamais faire échouer toute la qualification pour un souci de photo).

### 4. Étendre le schéma de qualification
Dans `src/lib/ai/qualify-lead-schema.ts` :
- Ajouter `photo_findings: string[]` (coerceList, ex. 6 éléments max) : ce que l'IA observe sur les photos (état visible, matériel identifié, ampleur des dégâts, etc.), vide si pas de photo analysée.
- Ajouter `media_analyzed: boolean` (utile pour l'affichage et le debug).
- Mettre à jour `LEAD_QUALIFICATION_JSON_SCHEMA` et `LEAD_QUALIFICATION_JSON_EXAMPLE` en conséquence, en gardant la compatibilité avec les qualifications déjà stockées en base (`leads.ai_qualification`) — champs optionnels avec défaut, ne pas rendre `photo_findings`/`media_analyzed` `required` pour ne pas casser la lecture des anciens leads.

### 5. Adapter `qualifyLead()`
Dans `src/lib/ai/qualify-lead.ts` :
- Nouveau paramètre optionnel `mediaBlocks?: MistralContentBlock[]`.
- Si `mediaBlocks` est fourni et non vide : construire le message utilisateur en tableau multimodal (texte du prompt actuel + blocs image), et **modifier le system prompt** : la phrase actuelle "tu ne peux pas voir [les photos] : n'en tire aucune conclusion" doit devenir une instruction d'analyse des photos jointes, en gardant la règle 1 ("n'invente rien") mais appliquée aussi à l'image (décrire uniquement ce qui est visible, pas de diagnostic médical/structurel certain — rester descriptif, pas prescriptif).
- Si pas de `mediaBlocks` : comportement strictement identique à aujourd'hui (le texte actuel "tu ne peux pas voir... n'en tire aucune conclusion" reste pertinent tel quel).
- Garder l'appel à `mistralChatParse` — vérifier que `mistralChatParse`/`mistralChat` transmettent bien un `content` en tableau sans le sérialiser en string au passage (c'est le point de la modification de la Phase 1).

### 6. Brancher dans le flux réel
- `computeLeadEstimate()` dans `src/app/estimation/actions.ts` : avant d'appeler `qualifyLead`, si `input.mediaCount > 0`, appeler `lead-media-vision.ts` pour récupérer les blocs image à partir du `leadId` (récupérable via la même RPC/`lead_id_from_token` déjà utilisée ailleurs dans ce fichier), puis les passer à `qualifyLead`. Le tout dans le `try/catch` existant : un échec de récupération/analyse des photos ne doit **jamais** faire tomber le flux dans l'heuristique texte de secours si le texte seul suffit — dégrader proprement vers qualification texte-only en cas de souci sur les photos, sans bloquer le prospect.
- Vérifie si `src/app/api/ai/qualify-lead/route.ts` est appelée par un composant front actif ; si oui, applique le même branchement pour rester cohérent, sinon signale-le-moi avant de la modifier (elle pourrait être un résidu de la phase 3 précédente).

### 7. Restituer les constats photo à l'artisan
Dans `src/lib/leads/lead-recap-message.ts` (`buildLeadRecapMessage`) : ajouter un bloc `"— Constats sur photos —"` listant `qualification.photo_findings` (uniquement si `media_analyzed` est vrai et la liste non vide), juste après le bloc "— Points techniques —". Garder le ton factuel et la formule finale "Fourchette indicative uniquement. Confirme après visite..." inchangée.

### 8. Confidentialité (point à me signaler, pas à trancher seul)
Les photos du domicile du client seront envoyées à un prestataire tiers (Mistral, société française/UE) pour analyse. Recommande-moi une phrase de transparence à ajouter dans `media-step.tsx` (l'étape d'upload du tunnel `/estimation`), du type "tes photos peuvent être analysées automatiquement pour affiner l'estimation" — mais ne modifie pas le composant sans me montrer le texte proposé d'abord.

## Garde-fous

- Ne jamais faire échouer tout le tunnel `/estimation` si l'analyse photo plante : fallback vers qualification texte-only (comportement actuel), qui elle-même fallback déjà vers `estimateLeadRange()` si Mistral est indisponible.
- Toujours plafonner à 3 photos envoyées à l'IA (coût), même si jusqu'à 6 peuvent être jointes au lead (limite actuelle dans `add_lead_media`).
- Ne pas envoyer les vidéos au modèle vision dans cette passe.
- Redimensionner avant envoi (perf + coût), ne jamais envoyer les fichiers bruts jusqu'à 50 Mo tels quels.

## Méthode de travail attendue

Avant de coder : confirme le nom exact du modèle vision Mistral à utiliser (vérifié dans la doc, pas supposé), montre-moi le texte de transparence RGPD proposé pour `media-step.tsx`, et confirme si `src/app/api/ai/qualify-lead/route.ts` est réellement utilisée avant d'y toucher. Implémente ensuite dans l'ordre des sections 1 à 7, avec `npm run lint` après chaque étape. Teste avec un cas simple (photo de fuite sous évier) et un cas plus complexe (tableau électrique à remplacer) pour vérifier que `photo_findings` reste factuel et n'invente pas de diagnostic.
