# Audit pré-pilote — Orbit Artisan (SolineBTP)

Date : 15/09/2026. Méthode : lecture seule (aucune ligne de code modifiée), 6 audits ciblés menés en parallèle sur le dépôt réel (`$HOME/mnt/OrbitArtisan`, branche `master`, HEAD `cd864da2`), croisés avec `docs/business-rules.md`, `docs/integrations.md`, `docs/database-schema.md` déjà présents dans le projet.

**Note opérationnelle** : `git status` montre des fichiers déjà modifiés non commités sur `master` (package.json, quotes/actions.ts, plusieurs composants nav/shell, etc.). Rien n'a été touché pendant cet audit — mais pour le Temps 2, il faudra décider quoi faire de ces changements en cours avant de créer la branche dédiée (les committer d'abord, les stasher, ou les inclure dans la branche de travail).

**Verdict global** : le moteur de calcul du devis (source des prix, ancrage catalogue artisan) et l'isolation multi-tenant RLS sont globalement sains — bon travail de base. En revanche, la chaîne de facturation contient plusieurs défauts qui produiraient de vraies factures fausses ou non conformes dès le premier chantier facturé, et la boucle de notification/validation humaine ne notifie en réalité personne par défaut. Ce sont les deux zones à traiter en priorité absolue avant le pilote.

---

## 1. Agent vocal (Twilio + ElevenLabs)

Architecture confirmée : l'agent conversationnel tourne côté ElevenLabs (hébergé, hors dépôt) ; Orbit Artisan expose 5 endpoints "tools" REST + le webhook de statut Twilio.

| Feature | Verdict | Gravité | Pourquoi | Amélioration |
|---|---|---|---|---|
| Auth + isolation tenant des tools vocaux (`tool-auth.ts`) | ✅ bien | — | `artisan_id` toujours dérivé du `called_number` (`tool-auth.ts:70-80`), jamais d'un paramètre client ; chaque tool filtre par `artisan_id`. Secret comparé en temps constant. | RAS |
| Webhook Twilio (signature + idempotence) | ✅ bien | — | Signature validée avant traitement (`status/route.ts:28-31`) ; RPC `process_twilio_voice_call_status` en `ON CONFLICT (twilio_call_sid) DO NOTHING` (migration 12). | RAS |
| Fallback après appel (`process-voice-call-intake.ts`) | ✅ bien | — | Chaque appel finit en `voice_call_intakes` `pending_review`, même en cas d'échec IA (draft dégradé plutôt que crash). Aucun envoi auto au client. | RAS |
| Source de prix du devis vocal (`create-quote-draft` → `build-quote-from-text.ts`) | ✅ bien | — | Main-d'œuvre = `labor_rate_per_hour` artisan, jamais une valeur LLM (le champ `labor_items.unit_price` produit par Mistral est explicitement jeté par `map-quote-draft-core.ts:49-62`). Matériaux = catalogue `supplier_products` par embedding, jamais de prix inventé. | RAS |
| **Latence de `create-quote-draft`** | ⚠️ améliorable | **Important, à tester avant le pilote** | Pipeline entièrement synchrone : extraction Mistral + boucle séquentielle embeddings/RPC par matériau, **aucun timeout** sur les appels Mistral (`src/lib/ai/mistral.ts:65-72`), et **pas de `export const maxDuration`** sur la route contrairement à sa route sœur (`generate-quote-from-chat/route.ts:8`). Risque de timeout pendant un appel réel avec plusieurs matériaux mentionnés. | Ajouter `maxDuration = 60`, timeouts sur Mistral/embeddings, paralléliser la boucle matériaux ; envisager de répondre immédiatement et traiter en tâche de fond. |
| Déduplication `create-quote-draft` | ⚠️ améliorable | Important | La protection anti-doublon ne joue que si `twilio_call_sid` est transmis par l'agent ElevenLabs (`process-voice-call-intake.ts:143-169`) — à vérifier que c'est bien systématique côté config agent. | Vérifier la config des tools ElevenLabs ; sinon rendre la dédup obligatoire côté serveur (rejeter si absent). |
| `schedule` désactivé | ⚠️ améliorable | Important (config externe) | Retourne un message explicite `appointment_booking_disabled` (`tools.ts:99-113`), pas un no-op silencieux — correct côté code. Mais `availability` reste actif : l'agent peut annoncer des créneaux qu'il ne peut ensuite pas réserver. | Vérifier par appel test réel que l'agent ElevenLabs gère bien ce message ; sinon retirer `availability` de sa config tant que `schedule` est off. |
| Alerte quota vocal épuisé | ⚠️ améliorable | Important, non bloquant | Alerting = `console.warn` serveur uniquement (`voice-quota-alerts.ts:14-25`), rien de poussé à l'artisan. Mitigé par le défaut `voice_allow_overage = true`. | Brancher l'alerte seuil 100% sur le système de push existant. |
| Gestion silences/interruptions | n/a | — | Entièrement délégué à ElevenLabs, hors du dépôt Orbit Artisan — rien à corriger ici. | — |

---

## 2. Devis / moteur de tarification

| Feature | Verdict | Gravité | Pourquoi | Amélioration |
|---|---|---|---|---|
| Source des prix — main-d'œuvre (manuel, chat IA, vocal) | ✅ bien | — | `laborTotalCents = labor_rate_per_hour × durée / 60` (`quotes/actions.ts:148`), taux artisan uniquement, jamais de valeur LLM (confirmé côté chat et vocal). | RAS |
| Source des prix — matériaux | ✅ bien | — | Matching embeddings contre `supplier_products` réel ; si aucun match, prix vide et création bloquée (`invalid_materials`), jamais de prix à 0 silencieux. Tavily = quantités uniquement, jamais un prix, dans ce flux. | RAS |
| Bibliothèque d'ouvrages (grille artisan) | ✅ bien | — | Catalogue de démarrage clairement étiqueté "indicatif, à ajuster" avant import ; une fois importé c'est le référentiel propre de l'artisan. | RAS |
| **Champ "Prix" des prestations (`services.price`)** | ⚠️ améliorable | **Important** | Libellé générique "Prix en € (facultatif)" laisse croire qu'il détermine le montant du devis — en réalité il n'est **jamais utilisé** dans `grand_total` (seul le taux horaire × durée compte). Risque réel de devis dont le total ne correspond pas à l'intention de l'artisan. | Fix minimal (texte) : préciser "n'affecte pas le calcul du devis, affichage uniquement" à côté du champ et dans le sélecteur de prestations. |
| Filtrage `exclude_from_invoice` à la création du devis | ✅ bien | — | Filtré côté client et serveur, double vérification cohérente. | RAS |
| `reduced_vat_rate` sur le devis | ✅ bien | — | Simple flag informatif (attestation Cerfa), n'entre dans aucun calcul de total — cohérent avec un devis HT. | RAS |
| Marge preview (`quote-margin.ts`, ratio 65%) | ⚠️ améliorable | Cosmétique/important | Ratio en dur, non réellement configurable malgré une signature qui le suggère. Le libellé UI reste honnête ("indicatif") mais le concept "coût MO à 65% du tarif facturé" n'a pas de sens pour un artisan solo. | Rendre configurable par profil, ou clarifier le libellé pour un solo sans salarié. |
| Remise commerciale | n/a (absent) | — | Fonctionnalité non implémentée, pas un bug. À arbitrer produit si besoin pendant le pilote. | — |
| Fourchette de prix avant devis (`estimation`, `leads`) | ❌ à refaire sur le fond | **Hors périmètre gelé (marketplace/leads) — signalé pour information** | Le tunnel `estimation`/`embed` appartient au matching multi-artisans gelé. Le taux horaire est bien ancré artisan, **mais la part matériaux est estimée par Tavily + LLM et injectée telle quelle dans la fourchette envoyée au prospect** (`lead-material-estimate.ts:95-153`) — exactement le scénario "fourchette web brute" à éviter, mais dans le périmètre gelé, pas dans l'outil artisan testé. | À traiter séparément avec le patron produit, hors scope de cette phase de test. |

---

## 3. Facturation FR (légal, TVA, numérotation) — zone la plus sensible

| Feature | Verdict | Gravité | Pourquoi | Amélioration |
|---|---|---|---|---|
| **Numérotation des factures** | ❌ à refaire | **BLOQUANT** | `invoice_number` dérivé de l'UUID du devis / d'un timestamp (`invoices/actions.ts:71`, `create-btp-invoice.ts:62`), **aucun compteur séquentiel**, **aucune contrainte UNIQUE en base**, éditable en texte libre. Le bouton "Facturer" n'a aucune protection double-submit → deux clics rapprochés (connexion instable sur chantier) peuvent créer deux factures identiques avec le même numéro et le même montant. Non-conforme à l'obligation de numérotation chronologique continue (art. A441-1/CGI 289-II). | Compteur séquentiel par artisan (table dédiée + `SELECT FOR UPDATE` ou insert atomique), attribué à la finalisation, contrainte `UNIQUE (artisan_id, invoice_number)`, champ non éditable après finalisation, garde anti double-submit. |
| **Doublement de la ligne main-d'œuvre à la facturation standard** | ❌ à refaire | **BLOQUANT** | `createInvoiceFromQuote` ajoute une ligne "Main d'œuvre" proratisée **et** une ligne par `quote_service` avec son propre prix catalogue (`invoices/actions.ts:133-166`) — le PDF/Factur-X (qui recalcule le total depuis la somme des lignes) affiche alors un total HT **supérieur** au montant réellement dû dès qu'un devis standard contient des prestations catalogue (cas quasi systématique). | Ne pas dupliquer : soit la ligne "Main d'œuvre" globale, soit le détail par prestation — jamais les deux dans le même total. |
| **TVA réduite BTP (5,5%/10%) jamais appliquée sur facture** | ❌ à refaire | **BLOQUANT** | Toutes les lignes de facture reçoivent systématiquement 20%/`S` (`einvoicing-types.ts:145-149`, appliqué partout), quel que soit `reduced_vat_rate`/`quote_materials.vat_rate` du devis source. **Aucun champ pour corriger le taux** dans `InvoiceEditForm`. Sur un chantier de rénovation à taux réduit, la TVA facturée et télétransmise (e-invoicing/e-reporting) est réellement fausse. | Propager le taux réduit du devis vers les lignes de facture, ou a minima bloquer/avertir avant envoi quand `reduced_vat_rate` est renseigné. |
| **Avoirs émis comme factures positives type 380** | ❌ à refaire | **BLOQUANT (le plus grave)** | `renderInvoicePdf` affiche toujours "FACTURE" et `build-cii-invoice.ts:176` fixe en dur `typeCode: "380"` — jamais "AVOIR"/"381", quel que soit `invoice_type`. `load-from-db.ts` ne sélectionne même pas `invoice_type`. Un avoir B2B finalisé est donc transmis à la Plateforme Agréée comme une **facture positive ordinaire pour le même montant que l'originale** → double comptabilisation de chiffre d'affaires côté client et côté fisc. | Faire porter `invoice_type` jusqu'au document (titre "AVOIR", `typeCode: "381"`, montant en négatif ou mention explicite) sur tout le pipeline PDF + Factur-X. |
| **Mentions légales de paiement absentes de la facture** | ❌ à refaire | **BLOQUANT** | `due_date` est calculée en base mais jamais sélectionnée ni affichée (`load-from-db.ts:74-78`) ; le texte sur les pénalités de retard + l'indemnité forfaitaire de recouvrement (40€, obligatoire B2B) n'existe que sur le document de mise en demeure, jamais sur la facture elle-même au moment de l'émission (art. L441-9/L441-10 C. com.). | Ajouter échéance, conditions de règlement et bloc pénalités/indemnité 40€ sur le rendu facture. |
| Mentions légales de base (SIRET, TVA intra, RCS, assurances) | ✅ bien | — | Bien présentes et conditionnées (`legal-mentions.ts:17-47`) sur devis et facture. Aucun garde-fou cependant si le profil artisan est incomplet — une facture peut partir sans ces mentions si l'artisan n'a pas renseigné son profil. | Ajouter un contrôle bloquant à la finalisation si SIRET/adresse/assurance manquent. |
| Libellé "Total TTC" sur le PDF devis pour un montant HT | ⚠️ améliorable | Important | `render-quote-pdf.ts:153` affiche "Total TTC" alors que `grand_total` est HT sans TVA — trompeur pour le client qui signe sur cette base. | Renommer en "Total HT (TVA non incluse)". |
| Autoliquidation sous-traitance BTP | ❌ à refaire (absent) | Important, non bloquant pour ce test précis | Aucune implémentation (`grep` négatif sur tout le repo, code catégorie "K" jamais assigné). Pertinent seulement si un des 5 artisans facture en sous-traitance pendant le mois de test. | À vérifier avec les 5 artisans pilotes ; sinon implémenter avant généralisation. |
| Retenue de garantie + `materialsShare` forcé à 0 | ⚠️ améliorable | Important | `labor_total` en-tête peut rester incohérent avec `grand_total` quand la retenue est forte — le montant facturé au client reste correct, mais l'export comptable est faux. | Recalculer `labor_total`/`materials_total` de façon cohérente après clamp. |
| Avoirs qui ne réduisent pas `alreadyInvoiced` | ⚠️ améliorable | Important | Peut bloquer artificiellement une facturation complémentaire légitime après un avoir. | Soustraire les avoirs du cumul au lieu de les exclure. |
| Matériaux `exclude_from_invoice` ignorés à la facturation | ⚠️ améliorable | Important (chevauche le périmètre gelé) | Un matériau marqué "hors facture" au devis est quand même reproratisé et facturé (`invoices/actions.ts:168-186` ne filtre pas cette colonne). | Filtrer `exclude_from_invoice` aussi côté facturation. |
| Statut `cancelled` (label UI vs contrainte DB) | ⚠️ cosmétique | Cosmétique | Code mort — aucun chemin ne peut poser ce statut, aucun artisan ne peut se bloquer dessus. | Nettoyage par hygiène, sans urgence. |
| Attestation TVA réduite (Cerfa) | ✅ bien | — | Contenu correct, s'auto-qualifie honnêtement de "modèle simplifié". | RAS pour un pilote. |

---

## 4. Prise de RDV

| Feature | Verdict | Gravité | Pourquoi | Amélioration |
|---|---|---|---|---|
| Persistance en base | ✅ bien | — | Vraie table relationnelle indexée, pas un champ fourre-tout. Durée déduite du service au moment de la lecture (fragile si service supprimé, mineur). | Matérialiser une durée/`end_time` à l'insert. |
| **Zéro double-booking** | ❌ à refaire | **BLOQUANT** | Aucune contrainte DB (`EXCLUDE`/`UNIQUE` sur créneau), 4 chemins d'écriture indépendants (RDV manuel artisan, RDV connecté, RDV invité vitrine, finalisation vitrine) sans vérification de conflit. Scénario plausible dès la première semaine avec vitrine publique active. | Contrainte `EXCLUDE USING gist` (nécessite `btree_gist` + durée matérialisée) ; à défaut, contrôle applicatif transactionnel sur les 4 points d'entrée en attendant. |
| Notification artisan à la réception d'un RDV vitrine | ❌ à refaire | **BLOQUANT** | Aucune catégorie de notification `appointments` n'existe (migration 16), aucun `notifyNewAppointment`. Un RDV pris à 8h peut rester invisible toute la journée pour un artisan sur chantier. | Ajouter `notifyNewAppointment`/`notifyAppointmentCancelled` en réutilisant l'infra push déjà en place pour messages/devis/factures. |
| `schedule` vocal désactivé | ⚠️ améliorable | Important (config externe) | Cf. section agent vocal — comportement correct côté code, à valider côté config ElevenLabs par un appel test. | Cf. section 1. |
| Isolation multi-tenant | ✅ bien | — | RLS + double filtrage applicatif cohérents, aucune fuite croisée identifiée. | RAS |
| Synchro agenda externe (Google Calendar, etc.) | n/a (absent) | — | Fonctionnalité non implémentée, pas un bug — à noter pour la roadmap si les artisans testeurs utilisent déjà un agenda externe au quotidien. | — |

---

## 5. Validation humaine

| Feature | Verdict | Gravité | Pourquoi | Amélioration |
|---|---|---|---|---|
| Devis vocal → validation (mécanisme) | ✅ bien | — | Jamais auto-envoyé ; 2 taps en cas nominal (notif → "Valider et envoyer"), conforme à l'exigence "un clic". Cas dégradé correctement plus lourd (données manquantes). | RAS sur le mécanisme lui-même. |
| Fidélité de la prévisualisation avant validation | ⚠️ améliorable | Important | Le total affiché sur `/app/appels` avant clic peut différer du total réellement envoyé (fallback de durée différent entre l'estimation et le calcul réel). Pas de détail ligne par ligne avant validation. | Utiliser la même fonction de calcul pour l'aperçu et l'envoi ; afficher le détail des lignes avant le clic final. |
| **Activation des notifications push** | ❌ à refaire | **BLOQUANT** | 100% opt-in, jamais proposée à l'onboarding ni ailleurs qu'en Réglages. Sans démarche active de l'artisan, aucune alerte ne sort de l'app fermée — scénario par défaut si personne ne le leur signale explicitement. | Proposer l'activation dans l'onboarding ou après le premier appel reçu, pas seulement en Réglages. |
| **Fiabilité du badge "à valider"** | ❌ à refaire | **BLOQUANT** | Le badge se réinitialise sur simple **visite** de la page (pas sur action réelle) et **aucune relance** n'existe pour un brouillon resté `pending_review`. Un devis peut être vu puis oublié sans qu'aucun signal ne réapparaisse. | Ne watermarker que sur action réelle (validé/rejeté), pas sur simple ouverture ; ajouter un cron de relance (même mécanique que `invoice-reminders`). |
| Devis généré depuis chat / suggestions IA (`suggest-reply`, `suggest-quote-notes`, `summarize-quote`) | ✅ bien | — | Toutes ces routes sont strictement en lecture, jamais d'écriture ni d'envoi automatique ; pré-remplissage de champs éditables uniquement. | RAS |
| **TVA matériaux codée en dur à 20% dans le chemin devis IA** | ❌ à refaire | **BLOQUANT** | `create-quote-from-ai-draft.ts:132` fixe `vat_rate: 20` sans regard sur la nature réelle des travaux, et rien dans l'écran de validation n'affiche ce taux avant le clic — même défaut que la TVA réduite en section Facturation, mais exposé ici via le chemin le plus rapide (un clic, sans détail visible). | Même correction que la section Facturation, appliquée aussi à ce chemin de création. |

---

## 6. Sécurité & isolation multi-tenant

| Feature | Verdict | Gravité | Pourquoi | Amélioration |
|---|---|---|---|---|
| Secrets (`.env`, clés en dur, `NEXT_PUBLIC_*`) | ✅ bien | — | `.env` jamais commité, aucune clé en dur, aucun secret exposé côté client par erreur. | RAS |
| Authentification (pattern général) | ⚠️ améliorable | Important | Pattern répété (`auth.getUser()` → `profiles.user_id`) discipliné et systématique, mais dupliqué fichier par fichier plutôt que centralisé dans un helper unique — risque d'oubli futur à l'ajout d'une route. | Extraire un helper `requireArtisanProfileId()` partagé. |
| Injections SQL | ✅ bien | — | Aucun SQL brut concaténé, RPC toujours paramétrés, Zod sur les webhooks sensibles. | RAS |
| **Dépendances vulnérables** | ❌ à corriger | **BLOQUANT** | `npm audit --production` : 19 vulnérabilités dont 1 critique (RCE non authentifiée) et plusieurs high, sur **Next.js 16.1.7** — plage vulnérable jusqu'à 16.3.2, incluant des **contournements de middleware** (le mécanisme même qui protège `/app`, `/admin`, `/compte`). | Mettre à jour Next.js vers 16.3.5+ avant le pilote, vérifier la compatibilité. |
| RLS — couverture générale | ✅ bien | — | Toutes les tables métier ont RLS activée avec des policies cohérentes filtrant par `artisan_id`/`user_id`. | RAS |
| **`profiles_public_read` expose des colonnes internes** | ❌ à refaire | **BLOQUANT** | Policy `using (true)` sur `profiles` expose via un simple appel REST avec la clé anon (publique par construction) des colonnes non destinées au public : Stripe, statut abonnement, quotas vocaux, SIRET/téléphone, pour **tous les artisans**. | Créer une vue publique dédiée avec uniquement les colonnes vitrine ; restreindre la policy actuelle. |
| **`seed_default_work_library` — écriture cross-tenant** | ❌ à refaire | **BLOQUANT** | Fonction `security definer` accordée à `authenticated` sans vérifier `p_user_id = auth.uid()` — combinée au point ci-dessus (récupération publique des `user_id`), un utilisateur authentifié quelconque peut écraser la bibliothèque d'ouvrages d'un autre artisan qui n'a pas encore de données. | Ajouter la vérification `p_user_id = auth.uid()` dans la fonction SQL. |
| Usages `SERVICE_ROLE_KEY` (webhooks, admin, actions serveur) | ✅ bien | — | Tous scopés correctement par signature/secret vérifié ou par `artisan_id` dérivé de la session serveur — seule exception le point ci-dessus. | RAS |
| Routes vocales — résolution de l'artisan | ✅ bien | — | Toujours via le numéro Twilio appelé, jamais un paramètre client. Secret partagé unique pour tous les artisans (acceptable pour un secret serveur-à-serveur, à surveiller/rotater en prod). | RAS pour le pilote. |
| Server Actions `/app/**` | ✅ bien | — | `artisan_id` toujours dérivé de la session serveur, jamais d'un paramètre client, avec double filtrage explicite en plus de la RLS. | RAS |

---

## Liste priorisée finale (tous domaines confondus)

### 🔴 Bloquants — à traiter avant le lancement du pilote

**Facturation (argent + conformité légale réelle) :**
1. Avoirs émis comme factures positives (type 380/"FACTURE") → double chiffre d'affaires déclaré/télétransmis. *(le plus grave de tout l'audit)*
2. Doublement de la ligne main-d'œuvre à la facturation standard → total HT gonflé envoyé au client.
3. TVA réduite BTP (5,5%/10%) jamais appliquée sur facture, sans moyen de correction manuelle → TVA facturée et télétransmise fausse.
4. Numérotation de facture non séquentielle, sans contrainte d'unicité, vulnérable au double-submit → non-conformité + risque de double facturation identique sur chantier.
5. Mentions légales de paiement absentes de la facture (échéance, pénalités, indemnité 40€) → non-conformité art. L441-9/10.

**Sécurité (accès non autorisé, fondations) :**
6. Next.js vulnérable (RCE critique + bypass de middleware) — fragilise toute l'authentification.
7. `profiles_public_read` expose des données internes (Stripe, SIRET, quotas) sans authentification.
8. `seed_default_work_library` permet l'écriture cross-tenant sans vérification d'ownership (exploitable via le point 7).

**Fiabilité opérationnelle chemin critique :**
9. Aucune protection anti double-booking sur les RDV (DB ni applicative).
10. Aucune notification artisan à la réception d'un RDV pris depuis la vitrine.
11. Notifications push jamais activées par défaut (opt-in caché en Réglages, aucun onboarding) → la boucle "notif → validation rapide" n'existe pas concrètement pour la plupart des artisans testeurs.
12. Badge "à valider" qui se réinitialise sur simple visite de page + aucune relance → un devis ou un appel traité peut rester oublié indéfiniment sans signal.
13. TVA matériaux codée en dur à 20% dans le chemin de création de devis IA (voix/chat) — même défaut que le point 3, exposé via le chemin le plus rapide (un clic).

### 🟠 Important — non bloquant, à corriger vite (avant ou pendant le pilote)
- Latence du tool vocal `create-quote-draft` (pas de timeout, pas de `maxDuration`) — à tester par un appel réel avant le lancement.
- Déduplication du brouillon vocal non garantie si `twilio_call_sid` absent côté agent ElevenLabs.
- Champ "Prix" des prestations jamais utilisé dans le calcul du devis malgré son libellé trompeur.
- Fidélité de la prévisualisation avant validation d'un devis vocal (total d'aperçu ≠ total réel).
- Libellé "Total TTC" sur le PDF devis pour un montant HT.
- Autoliquidation sous-traitance absente — à vérifier avec les 5 artisans pilotes.
- Incohérence `labor_total`/`grand_total` avec forte retenue de garantie (impact comptable, pas client).
- Avoirs qui ne réduisent pas le reste-à-facturer.
- Matériaux `exclude_from_invoice` non filtrés à la facturation.
- Pattern d'authentification dupliqué plutôt que centralisé (hygiène, risque d'oubli futur).
- Absence d'alerte proactive à l'artisan sur quota vocal épuisé (mitigé par le défaut sûr actuel).
- Config de l'agent vocal ElevenLabs à vérifier pour le fallback RDV désactivé (`schedule`/`availability`).

### ⚪ Cosmétique / hygiène de code
- Statut `cancelled` orphelin (code mort, aucun impact réel).
- Ratio de marge à 65% en dur dans `quote-margin.ts` (déjà correctement étiqueté "indicatif" côté UI).
- Variables d'environnement vocales absentes de `.env.example` (risque d'oubli de config, pas un bug de code).
- Absence de synchro agenda externe (Google Calendar…) — fonctionnalité non prévue, pas un défaut.
- Fourchette de prix marketplace partiellement ancrée sur du web/LLM — hors périmètre gelé de ce test, signalé pour information au patron produit.

---

## Suivi des correctifs — Temps 2

Branche : `pilote/vague1-securite-fiabilite` (depuis `master`, commit de départ `92ea487`). Périmètre gelé (marketplace / mise en relation multi-artisans / panier matériaux / fourchette de prix lead) non touché. Bouton "Facturer" et vitrine publique restent gelés (voir commit `937b563`).

### VAGUE 1 — terminée (16/09/2026), avant lancement pilote

| # | Sujet | Statut | Commit |
|---|---|---|---|
| 6 | Next.js 16.1.7 → 16.3.5 (RCE critique + bypass middleware) | ✅ Corrigé | `e1f86cf` |
| 7 | `profiles_public_read` — colonnes anon restreintes (Stripe/SIRET/quotas/téléphone masqués) | ✅ Corrigé — ⚠️ migration `17_restrict_profiles_anon_columns.sql` à exécuter manuellement dans Supabase | `adcada9` |
| 8 | `seed_default_work_library` — vérification ownership `p_user_id = auth.uid()` | ✅ Corrigé — ⚠️ migration `18_fix_seed_default_work_library_ownership.sql` à exécuter manuellement dans Supabase | `d096880` |
| 11 | Notifications push proposées proactivement (bannière après 1er appel / dès que possible, plus seulement en Réglages) | ✅ Corrigé | `10aa787` |
| 12 | Badge "à valider" réinitialisé uniquement sur action réelle + cron de relance des devis vocaux oubliés (2h/24h) | ✅ Corrigé — ⚠️ migration `19_voice_intake_reminders_and_badge_fix.sql` à exécuter manuellement. Cron repassé en quotidien (`0 9 * * *`, une passe le matin) après confirmation du plan Vercel Hobby (1x/jour max) | `59f0556`, `add975a` |
| 13 | Taux de TVA en dur (20%) retiré du chemin devis IA vocal ; taux choisi par l'artisan à l'écran de validation ; libellé PDF "Total TTC" → "Total HT (TVA non incluse)" | ✅ Corrigé | `c0d43ce` |
| 14 | Fiabilité appel vocal en direct : `maxDuration=60`, timeouts Mistral/embeddings, matching matériaux parallélisé, dédup serveur indépendante de `twilio_call_sid`, fallback RDV désactivé vérifié par lecture de code | ✅ Corrigé (code) — ⚠️ **appel test réel encore nécessaire** pour confirmer (a) que l'agent ElevenLabs transmet bien `twilio_call_sid`, (b) le comportement conversationnel du fallback RDV désactivé | `14f207b` |

**Non résolu par du code, nécessite une action de ta part avant/pendant le pilote :**
- Exécuter les 3 migrations SQL ci-dessus dans l'éditeur SQL Supabase (17, 18, 19) — aucune n'est destructive, toutes sont idempotentes.
- Passer au moins un appel test réel sur le numéro vocal pour valider la latence de bout en bout et le comportement du fallback RDV.
- Vérifier dans le dashboard ElevenLabs que le tool `create-quote-draft` transmet bien `twilio_call_sid` (le filet de dédup ajouté au point 14 réduit le risque si ce n'est pas le cas, mais ne le remplace pas).
- `npm run build` n'a pas pu être vérifié en bout en bout dans le bac à sable (Google Fonts bloqué par le proxy réseau du sandbox, sans rapport avec la mise à jour Next.js) — à lancer une fois en local ou laisser Vercel le confirmer au déploiement.
- Les 3 crons de `vercel.json` sont maintenant à cadence quotidienne unique chacun, compatible avec le plan Hobby. Si le plan Hobby limite aussi le **nombre total** de crons par projet (pas seulement leur fréquence), vérifier dans le dashboard Vercel qu'un déploiement avec 3 crons distincts est bien accepté.

### VAGUE 2 — terminée (16/09/2026), code prêt mais **"Facturer" reste gelé**
Branche : `pilote/vague2-facturation-legale` (depuis la tête de `pilote/vague1-securite-fiabilite`, commit `83db750`). **Ne passe en production qu'après validation de la spec par un expert-comptable** (avoir 381, taux réduits, mentions légales, e-reporting) — c'est une condition explicite posée avant de coder, pas une case à cocher a posteriori.

| # | Sujet | Statut | Commit |
|---|---|---|---|
| 1 | Avoir : `invoice_type` porté jusqu'au document (titre "AVOIR", `typeCode` CII 381, montants **positifs** — voir note ci-dessous) ; `load-from-db.ts` sélectionne enfin `invoice_type` | ✅ Corrigé | `494231d` |
| 2 | Doublement main-d'œuvre : suppression de la boucle par `quote_service` (prix catalogue jamais dans `labor_total`), ne garde que la ligne "Main d'œuvre" globale | ✅ Corrigé | `f129d20` |
| 3 | TVA réduite propagée du devis vers toutes les lignes de facture (main-d'œuvre + matériaux, y compris avoirs et factures d'acompte/situation/solde) ; correction manuelle en un geste sur brouillon ; bandeau d'alerte + blocage dur à la finalisation si taux invalide | ✅ Corrigé | `6512730`, `cf4cc93` |
| 4 | Numérotation séquentielle par artisan/type/année (`allocate_invoice_number`, atomique, attribuée à la finalisation) ; contrainte `UNIQUE (artisan_id, invoice_number)` ; claim anti double-submit ; numéro non éditable (ni avant ni après finalisation, système uniquement) | ✅ Corrigé — ⚠️ migration `20_invoice_sequential_numbering.sql` à exécuter manuellement dans Supabase | `c3a4f61` |
| 5 | Échéance + conditions de règlement + bloc pénalités de retard/indemnité 40€ (B2B uniquement) sur le PDF ; BT-9 (échéance) ajouté au CII Factur-X transmis à la PA | ✅ Corrigé | `925d963` |
| — | *Importants facturation* : avoirs soustraits de `alreadyInvoiced` (au lieu d'être exclus) ; retenue de garantie — le surplus dépassant la part matériaux est reporté sur la main-d'œuvre (`labor_total + materials_total = grand_total` toujours vrai) ; `exclude_from_invoice` filtré aussi côté facturation ; contrôle bloquant à la finalisation si SIRET/adresse/assurance décennale manquent | ✅ Corrigé | `8b1ab6e` |

**Point d'attention explicitement signalé (déviation assumée par rapport à la demande initiale) :** la demande disait "montant négatif" pour l'avoir. Vérification faite (EN16931/Peppol) : un avoir `typeCode` 381 doit garder des **montants positifs** dans le CII/XML transmis — négativer en plus du typeCode crée une double négation qui fait échouer la validation chez la plupart des plateformes de réception (règle BR-27). Le PDF humain affiche un signe négatif par lisibilité ; le XML légal reste positif + 381. À confirmer par l'expert-comptable en même temps que le reste de la spec.

**Limite connue, assumée (voir commit `c3a4f61`) :** si `finalize()` échoue *après* soumission à la Plateforme Agréée (ou insertion en file e-reporting) mais *avant* l'écriture finale en base, le numéro alloué reste consommé et un nouvel essai en tirera un autre — un petit gap de séquence peut apparaître. Toléré par la doctrine fiscale (BOI-TVA-DECLA-30-20-20) pour un incident technique non systématique ; à surveiller si ça devient fréquent en usage réel, et à signaler à l'expert-comptable.

**Non résolu par du code, nécessite une action de ta part avant mise en production (pas avant le pilote, puisque "Facturer" reste gelé) :**
- Faire valider l'ensemble de la spec Vague 2 par un expert-comptable : numérotation par série (une série par type ACO/SIT/SOL/AVO/INV plutôt qu'une série unique — choix documenté dans la migration 20, à confirmer), avoir 381 à montants positifs, mentions de pénalités B2B, e-reporting.
- Exécuter la migration `20_invoice_sequential_numbering.sql` dans l'éditeur SQL Supabase (idempotente, non destructive).
- Décider de la date de dégel du bouton "Facturer" une fois la validation comptable obtenue.

### VAGUE 3 — terminée (16/09/2026), avant réactivation de la vitrine publique
Branche : `pilote/vague3-rdv-fiabilite` (depuis la tête de `pilote/vague2-facturation-legale`, commit `82e9c86`).

| # | Sujet | Statut | Commit |
|---|---|---|---|
| 9 | Anti double-booking : colonne `appointments.end_time` matérialisée par trigger (`start_time` + `services.duration`, 60 min par défaut si service absent/supprimé) ; contrainte `EXCLUDE USING gist (artisan_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE status <> 'cancelled'` (nécessite `btree_gist`) — protection au niveau base, donc valable même en cas de double soumission concurrente. Les 4 points d'écriture (RDV manuel artisan, RDV connecté vitrine, RDV invité vitrine, finalisation RDV en attente) traduisent l'erreur Postgres 23P01 en message "créneau déjà pris" (dialogue artisan, toast vitrine, écran d'inscription, `/compte`) | ✅ Corrigé — ⚠️ migration `21_appointment_overlap_guard.sql` à exécuter manuellement dans Supabase (contient une requête de contrôle anti-chevauchement à lancer d'abord, voir plus bas) | `e27df5c` |
| 10 | `notifyNewAppointment` ajoutée (même infra push que messages/devis/factures/appels vocaux) et branchée sur les 3 points d'entrée originaires de la vitrine publique (RDV connecté, RDV invité, finalisation RDV en attente) ; pas d'appel pour un RDV saisi par l'artisan lui-même | ✅ Corrigé | `b750ab4`, `e27df5c` |

**Décision assumée (signalée, pas juste appliquée) :** `notifyAppointmentCancelled`, mentionnée dans l'audit à côté de `notifyNewAppointment`, n'a pas été ajoutée : aucun parcours client existant ne permet d'annuler un RDV (seul l'artisan annule son propre RDV depuis `/app/rdv` — s'auto-notifier n'aurait pas de sens). À ajouter si une annulation côté client est introduite un jour.

**Corrigé au passage (pas dans l'audit initial) :** sur `/compte?pending=...`, un échec de finalisation de RDV en attente était auparavant silencieusement ignoré (aucun message affiché). Un bandeau d'erreur avec libellé par type d'échec a été ajouté.

**Effet de bord à noter (positif) :** la durée d'un RDV est désormais figée à l'insertion plutôt que déduite en lecture depuis `services.duration` — ferme au passage l'item mineur du même point de l'audit ("Durée déduite du service au moment de la lecture, fragile si service supprimé"). Aucun impact sur la facturation, les totaux, ou la génération PDF/XML.

**Non résolu par du code, nécessite une action de ta part avant de réactiver la vitrine publique :**
- Avant d'exécuter la migration `21_appointment_overlap_guard.sql` : lancer la requête de contrôle placée en commentaire en tête du fichier (doit renvoyer 0 ligne). Si des RDV existants se chevauchent déjà pour un même artisan, en annuler un des deux manuellement avant d'appliquer la contrainte, sinon l'`ALTER TABLE ... ADD CONSTRAINT` échouera au moment de l'exécuter.

### VAGUE 4 — terminée (16/09/2026), hygiène sans urgence

> ⚠️ **Note de synchronisation (17/09/2026)** : un commit `cc26b84` (auteur Florian, co-authored Cursor) a réécrit ce fichier sur la copie device pour repasser cette section en "en attente" et supprimer le détail des commits, avec un message final laissant entendre que la Vague 4 n'avait pas encore été attaquée. Ce n'est pas le cas : les 7 commits ci-dessous existent bel et bien sur `pilote/vague4-hygiene` (vérifié via `git log`), et la Vague 5 (devis/PDF légal) a été construite par-dessus une fois master à jour. Tout porte à croire que Cursor travaillait sur une copie de ce fichier antérieure à la Vague 4 et a écrasé la version à jour sans le vouloir — pas une décision délibérée de revenir sur ces correctifs. Détail et section Vague 5 restaurés ci-dessous ; si la caractérisation "terminée" ne convient plus (relecture volontaire avant validation, par exemple), le dire explicitement plutôt que de la faire disparaître silencieusement — sinon le prochain outil qui synchronise ce fichier répétera le même écrasement.

Branche : `pilote/vague4-hygiene` (depuis la tête de `pilote/vague3-rdv-fiabilite`, commit `f95e27c`).

| # | Sujet | Statut | Commit |
|---|---|---|---|
| 1 | Champ "Prix" prestations : ajout d'un sous-texte sous le champ (formulaire + ligne de prestation existante) et clarification de la description Prestations sur le devis précisant que ce prix est un affichage seul, sans effet sur le montant du devis (calculé sur taux horaire × durée) | ✅ Corrigé | `e7004ed` |
| 2 | Fidélité de la preview devis vocal : extraction d'un calcul partagé (`computeDraftTotals` / `resolveLaborDurationMinutes`) utilisé à la fois par l'aperçu sur `/app/appels` et par la création réelle du devis — même règle de fallback de durée des deux côtés. Détail ligne par ligne (MO + matériaux) ajouté avant validation, au lieu d'un simple total agrégé | ✅ Corrigé | `bcc7aa3` |
| 3 | Alerte artisan sur quota vocal épuisé : `notifyVoiceQuotaExhausted` ajoutée (même infra push que messages/devis/factures/RDV), déclenchée uniquement au franchissement du seuil 100 % | ✅ Corrigé | `a371eec` |
| 4 | Helper `requireArtisanProfileId()` : centralisation du pattern `auth.getUser()` → `profiles.user_id` dans `src/lib/auth/require-artisan.ts` (2 primitives composables + 2 wrappers), migration de 13 fichiers (26 fonctions) en préservant à l'identique chaque libellé d'erreur et chaque cible de redirection d'origine — refactor volontairement non-normalisant pour ne rien changer au comportement visible | ✅ Corrigé | `dec1215` |
| 5 | `.env.example` incomplet : le fichier n'était même pas versionné (exclu par la règle `.env*` du `.gitignore`, donc inutile pour l'onboarding d'un poste de dev) — ajouté explicitement (`git add -f`) et complété avec les variables utilisées dans le code mais absentes : `TWILIO_AUTH_TOKEN`, `TWILIO_STATUS_CALLBACK_URL`, `VOICE_AI_TOOL_SECRET` (agent vocal), `RESEND_API_KEY`, `EMAIL_FROM` | ✅ Corrigé | `664a310` |
| 6 | Statut `cancelled` orphelin : c'était le libellé `INVOICE_STATUS_LABELS.cancelled` (factures), pas le statut RDV — la contrainte DB `invoices.status` (migration 06) n'admet que `draft/sent/paid/overdue`, une facture annulée passe par un avoir (`credit_note`). Libellé mort retiré, tous les appelants de `invoiceStatusLabel()` vérifiés | ✅ Corrigé | `3fdce47` |
| 7 | Ratio de marge 65 % en dur (`quote-margin.ts`) : entre les deux pistes proposées (configurable par profil vs. clarifier le libellé), clarification retenue par souci de simplicité (KISS) — le ratio est déjà paramétrable techniquement (params optionnels) et déjà étiqueté "indicatif" ; un réglage par artisan pour une preview sans impact facturation serait de la suringénierie pour 5 artisans pilotes. Libellé bandeau + commentaires code explicitent que c'est une hypothèse générique unique, y compris pour un solo sans salarié | ✅ Corrigé (clarification) | `360cc0d` |
| 8 | Autoliquidation sous-traitance BTP | ⏸️ Bloquée | — bloquée en attente de ta réponse (voir note ci-dessous) |

**Point 4 — détail des exclusions volontaires (documentées dans le commit) :** `abonnement/actions.ts::openStripeBillingPortal` (ne sélectionne pas `profiles.id`, migré partiellement pour la partie user), `profile/actions.ts` (l'absence de ligne y signifie "à créer", pas une erreur — sémantique différente), `services/actions.ts::deleteService` (aucun contrôle d'auth n'existait déjà sur cette fonction, hors périmètre d'un refactor qui préserve le comportement existant).

**Point 8 — non traité, bloqué sur ta confirmation :** aucune implémentation de l'autoliquidation TVA sous-traitance (code catégorie "K") n'existe dans le repo. Pertinent seulement si un des 5 artisans pilotes facture en sous-traitance pendant le mois de test — **question toujours ouverte, sans réponse à ce jour**. Tant que je n'ai pas ta confirmation, je ne l'implémente pas (comportement actuel : TVA normale appliquée même en sous-traitance, ce qui serait fiscalement incorrect pour ce cas précis).

**Vérification finale Vague 4** : `tsc --noEmit` clean, `eslint .` sur tout le repo → seulement les 2 erreurs préexistantes déjà connues et non liées (`estimation-loading.tsx:22`, `app-mobile-bottom-nav.tsx:20`), `vitest run` → 144/144 tests verts. 7 commits, un par point.

### VAGUE 5 — terminée (17/09/2026), audit devis/édition de devis (PDF inclus) — commande dédiée de Florian
Branche : `pilote/vague5-devis-legal-dev` (depuis la tête de `master`, commit `31f5783` — Florian avait entre-temps mergé/pushé les Vagues 1 à 4 et continué son propre travail sur le PDF devis et l'assistant). Demande initiale : "analyse la partie devis et édition de devis (PDF inclus)... d'un point de vue légal... d'un point de vue dev", en expert-comptable senior + développeur full-stack senior — indépendante des 4 vagues de l'audit pré-pilote initial.

| # | Sujet | Statut | Commit |
|---|---|---|---|
| — | Bug préexistant découvert en vérifiant la suite avant de committer (pas un finding de l'audit) : `build-quote-pdf-lines.test.ts` comparait à une TVA mal recalculée à la main (600+600 au lieu de 900+600) | ✅ Corrigé | `9caf7ba` |
| 1 | Assurance décennale : simple avertissement à l'envoi d'un devis (le blocage dur n'existait que côté facture, Vague 2) — or "Facturer" reste gelé, le devis est aujourd'hui le seul document qui atteint réellement un client. Exercer sans décennale sur des travaux qui y sont soumis est pénalement sanctionné (art. L243-3 C. assurances, jusqu'à 6 mois + 75 000 €) | ✅ Corrigé — décennale désormais bloquante à l'envoi d'un devis (RC Pro/médiateur/TVA intra restent des avertissements, sanctions purement administratives) | `ce9f5aa` |
| 2 | Droit de rétractation (art. L221-18 et s. C. consommation) totalement absent — pertinent car un devis artisan est presque toujours signé hors établissement (domicile client, chantier), jamais en boutique. Le produit n'a aucune notion B2B/B2C, donc mention affichée par défaut | ✅ Corrigé — mention du délai de 14 jours + modèle de formulaire de rétractation sur le PDF par défaut ; case "renonciation expresse" côté formulaire artisan (art. L221-28 3°) avec mention + ligne de signature dédiée si cochée | `b70d76c`, `8c08e36` |
| 3 | Péremption du devis jamais vérifiée : le PDF affiche "valable jusqu'au" (3 mois) mais `client_accept_quote` acceptait un devis "sent" quel que soit son âge | ✅ Corrigé — `quotes.valid_until` figé à la création (au lieu d'être recalculé dans le PDF), vérifié par la RPC d'acceptation ; bandeau + bouton "Valider" masqué côté client si expiré | `57d897d` |
| 4 | Édition/suppression d'un devis brouillon absentes : seule option pour corriger une erreur de saisie = dupliquer puis retaper, sans pouvoir supprimer l'original raté | ✅ Corrigé — `updateQuote`/`deleteQuote` réservés aux brouillons (`status = 'draft'`), garde anti-course sur le statut au moment de l'écriture ; page `/app/quotes/[quoteId]/edit` + boutons Modifier/Supprimer sur la fiche devis | `6f2ad3b` |

**Confirmé au passage (rassurant) :** les deux points historiquement les plus graves sur ce module dans l'audit initial — libellé "Total TTC" trompeur pour un montant HT, et TVA matériaux codée en dur à 20 % dans le chemin devis IA — étaient déjà corrigés depuis les Vagues 1/2 (le devis calcule et affiche désormais une vraie ventilation HT/TVA/TTC par taux). Seul `business-rules.md` (doc projet séparé, pas synchronisé avec cet audit) décrivait encore l'ancien état — mis à jour au passage (documentation uniquement, aucun changement de code lié).

**Limite assumée (point 4) :** l'édition traite tous les matériaux existants comme des lignes manuelles génériques — le lien vers un éventuel catalogue fournisseur d'origine (`supplier_product_id`/`url`/`sku`) n'est pas reconstitué après une modification. Impact nul en pratique : aucune commande fournisseur n'est jamais passée depuis un brouillon.

**Choix assumé (point 2, à valider) :** le droit de rétractation est traité par une mention légale + formulaire type imprimés sur le PDF, pas par un blocage technique empêchant de démarrer les travaux avant l'expiration des 14 jours — choix KISS déclaré explicitement, pas une omission. À surveiller si ça devient un point de friction réel avec un client pendant le pilote.

**Non résolu par du code, nécessite une action de ta part :**
- Exécuter les migrations `23_quote_retraction_waived.sql` et `24_quote_valid_until.sql` dans l'éditeur SQL Supabase (idempotentes, non destructives — la 24 recrée aussi la fonction `client_accept_quote`).
- Valider ou ajuster le choix de rendre la décennale bloquante mais pas RC Pro/médiateur/TVA intra à l'envoi d'un devis — c'est un arbitrage produit, pas une obligation légale uniforme entre ces mentions.
- Pousser la branche `pilote/vague5-devis-legal-dev` (le push depuis le bac à sable échoue toujours faute d'identifiants Git accessibles — à faire depuis ton propre terminal, comme pour les vagues précédentes).

**Vérification finale Vague 5** : `tsc --noEmit` clean, `eslint` sur tous les fichiers touchés clean, `vitest run` → 155/155 tests verts (dont 3 nouveaux tests dédiés à la décennale bloquante). 6 commits.

### VAGUE 6 — recherche + prépa (17/09/2026), facturation électronique PA — demande dédiée de Florian
Branche : `pilote/vague6-facturation-electronique-pa` (depuis la tête de `pilote/vague5-devis-legal-dev`, commit `cc26b84`). Demande : "trouve le meilleur moyen d'intégrer ce système à Soline, le moins cher également, et fais le travail nécessaire pour l'intégrer" — suite à une question générale sur l'existence d'un système de facturation électronique gratuit agréé par l'État.

**Constat de départ, important :** l'intégration PA (Plateforme Agréée) existe déjà en grande partie dans le code depuis une vague antérieure — adapters `noop`/`http`/`pennylane` avec retry, webhook entrant signé HMAC, file d'e-reporting B2C, tout documenté dans `integrations.md` §2-3. Ce qui manquait vraiment n'était donc pas du code, mais : (a) le choix d'un vrai fournisseur PDP, question commerciale/contractuelle qui n'appartient qu'à Florian, et (b) la validation de la forme exacte du payload HTTP générique contre la doc réelle de ce fournisseur, chose impossible sans compte/sandbox.

**Recherche menée (comparatif fournisseurs PDP/PA)** :

| Fournisseur | Statut réglementaire | Tarif trouvé | Adapté à un éditeur SaaS multi-artisans ? |
|---|---|---|---|
| **Super PDP** | Immatriculé PDP (revendiqué sur le site officiel) | API : ~0,0025€/facture au volume ; compte perso gratuit jusqu'à 1000 factures/mois ; pas d'abonnement minimum trouvé publiquement | ✅ Le moins cher de loin ; API-first, doc dédiée éditeurs — mais support explicite multi-SIREN/"marque grise" non confirmé par la doc publique (page JS non entièrement accessible en lecture automatisée) |
| Docaposte (marque commerciale : SERES) | Immatriculé, acteur historique (groupe La Poste) | Tarifs "sur devis" — pas de grille publique | Probablement, mais orienté grands comptes/PME établies ; devis sur-mesure peu adapté à un pilote à 5 artisans |
| Pennylane | Immatriculé, adossé à leur suite compta | Pas de tarif API autonome trouvé publiquement (couplé à leur logiciel) | Adapter déjà codé (`PennylanePayloadSubmitter`), mais suppose probablement un abonnement à leur suite compta complète |
| Confactura | **Pas une PA** — un simple générateur Factur-X ("Solution Compatible", transmission via une PA tierce) | Gratuit jusqu'à 20 documents/mois, puis 19-149€ selon volume | Non pertinent comme fournisseur PA : redondant avec le pipeline Factur-X déjà maison (`src/lib/billing/facturx/`). Le nom reste dans le code uniquement comme alias de l'adapter HTTP générique — pas d'appel à un vrai service Confactura. |

**Recommandation** : Super PDP, sous réserve de confirmation directe (par Florian, contact commercial) du support multi-SIREN pour un éditeur — c'est le seul point qui pourrait le disqualifier. Coût estimé pour le pilote (5 artisans, quelques factures/mois chacun) : de l'ordre de quelques centimes à 1€/mois, négligeable.

**Travail réalisé (code)** :

| # | Sujet | Statut | Commit |
|---|---|---|---|
| 1 | `superpdp` ajouté comme valeur explicite de `PA_PROVIDER` (alias de l'adapter HTTP générique, comme `docaposte`/`confactura` déjà existants) ; commentaires de code + `.env.example` mis à jour pour documenter que la forme du payload HTTP est une hypothèse générique à valider contre la doc réelle avant mise en prod ; 7 nouveaux tests sur la résolution du provider | ✅ Corrigé | `8264d8b` |

**Ce que je n'ai pas pu faire (hors de ma portée, pas juste "pas encore fait") :**
- Créer un compte / signer un contrat chez Super PDP (ou tout autre PDP) — création de compte et engagement contractuel/financier, action réservée à Florian.
- Confirmer le support multi-SIREN (un seul contrat/API pour soumettre au nom de plusieurs artisans différents) — nécessite un contact direct avec Super PDP, pas disponible via la doc publique.
- Valider la forme exacte du payload HTTP générique (`file`/`pdf`/`xml`/`metadata`) contre la vraie spec API — nécessite des identifiants sandbox réels.
- Aucun impact sur le gel de "Facturer" : `INVOICING_FROZEN = true` (`src/lib/billing/invoicing-freeze.ts`) bloque toute création de facture réelle en amont de tout appel PA, donc ce travail ne rouvre rien côté production.

**Non résolu par du code, nécessite une action de ta part :**
- Créer un compte Super PDP (ou contacter leur commercial pour une offre éditeur/API) et confirmer le support multi-SIREN.
- Une fois le compte ouvert : récupérer les identifiants sandbox + la doc API réelle et me les transmettre pour que j'ajuste l'adapter si le format diffère de l'hypothèse générique actuelle, puis teste en sandbox.
- Configurer `PA_PROVIDER=superpdp`, `PA_API_URL`, `PA_API_KEY` (et `PA_WEBHOOK_SECRET` si Super PDP fournit des webhooks de statut) dans les variables d'environnement Vercel une fois validé.

---

**Prochaine étape** : Vagues 1 à 6 terminées et vérifiées côté code (voir note de synchronisation Vague 4 ci-dessus — à clarifier avec toi). "Facturer" reste gelé et la vitrine publique reste désactivée. Actions en attente côté Florian : exécuter les migrations SQL 20 à 24 dans Supabase, décider de la date de dégel de "Facturer", pousser les branches Vague 5 et Vague 6 vers `origin`, arbitrer l'autoliquidation sous-traitance (Vague 4, point 8) et le niveau de blocage RC Pro/médiateur/TVA intra sur devis (Vague 5, point 1), et pour la Vague 6 : créer un compte Super PDP et confirmer le support multi-SIREN avant d'aller plus loin sur l'intégration PA réelle.
