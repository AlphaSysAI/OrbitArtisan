# Audit stratégique, fonctionnel, métier et technique — SolineBTP

Date : 4 novembre 2026. Référence examinée : `b3367a253296656c0255d163024700e3ff7620bd`.

## 1. Conclusion de décision

SolineBTP possède une proposition de valeur crédible : récupérer les appels manqués, transformer les demandes en actions et préparer les documents à partir d'informations déjà connues. La navigation « À traiter / Clients / Documents / Agenda », la fiche client sans compte obligatoire et les garde-fous du téléphone vont dans la bonne direction.

**Le périmètre fonctionnel est plus avancé que la fiabilité de ses enchaînements. Je déconseille une généralisation de la facturation et des automatismes financiers avant traitement des priorités P0/P1 ci-dessous.** Cette recommandation ne signifie pas que tout le produit doit être réécrit : la plupart des corrections relèvent de calculs partagés, de transactions courtes et de transitions explicites.

Trois sujets dominent :

- L'argent n'a pas une définition unique entre devis, lignes de facture, encaissement et export comptable.
- Certaines opérations sont découpées en écritures indépendantes, avec des états intermédiaires que les autres modules considèrent déjà comme définitifs.
- Les protections ajoutées en base ne sont pas systématiquement testées avec les parcours applicatifs qui les utilisent.

Le téléphone est le meilleur candidat à la différenciation commerciale. Le chiffrage technique autonome tous corps d'état est beaucoup plus risqué : il doit rester une aide à préparer un brouillon, avec hypothèses et prix à confirmer.

## 2. Périmètre, méthode et limites

Audit de lecture du dépôt : pages et actions Next.js, bibliothèques métier, API, SQL initial et migrations jusqu'à 66, tests, documentation et configuration de planification. Cartographie réalisée avant les recommandations. Les commentaires et documents internes ont servi de pistes, jamais de preuves suffisantes.

Les constats portent sur le code présent. Aucun accès connecté à Supabase ou à l'agent ElevenLabs déployé n'était disponible parmi les outils. Je n'ai pas interrogé la production, lu les secrets du fichier `.env`, exécuté de migration, envoyé d'e-mail/SMS, ni appelé un modèle payant. La présence des migrations dans le dépôt ne prouve pas leur application. Les prompts éventuellement stockés dans la base réelle et dans la console ElevenLabs restent à inventorier avec un accès de lecture adapté.

Pas de recette visuelle dans un navigateur ni d'observation d'artisans réels : les conclusions UX sont tirées des formulaires, libellés et transitions, pas d'une mesure d'utilisabilité. Pas de test de charge, de pentest actif, ni de certification Factur-X. Le build de production n'a pas été lancé : le contrôle TypeScript sans génération et la suite locale suffisaient aux vérifications sûres retenues.

**Qualification des résultats :** « confirmé » désigne un comportement démontré par le code, éventuellement caractérisé par un test local ; « risque probable » désigne un scénario plausible dont les conditions réelles ne sont pas vérifiées ; « recommandation » désigne une décision produit ou une amélioration. Les défauts SQL sont confirmés dans les définitions du dépôt, leur présence en production est inconnue.

**Priorités :** P0 = bloquant avant généralisation du flux concerné ; P1 = correction importante à court terme ; P2 = optimisation après stabilisation. Efforts en jours de travail d'un développeur connaissant le projet, incluant tests ciblés, hors délais juridiques et fournisseurs. Les estimations se recouvrent : ne pas additionner les lignes mécaniquement.

Livrables associés : `PROMPTS.md`, `VERIFICATIONS.md`, journaux de tests et tests de caractérisation dans ce même dossier. Aucun fichier applicatif modifié.

## 3. Cartographie fonctionnelle et architecture

### 3.1 Parcours et modules vérifiés

1. **Acquisition et qualification.** `/estimation`, `/embed/[slug]`, vitrine `/site/[slug]`, lots métiers, estimation, recherche et mise en relation. Sources : `src/app/estimation/actions.ts`, `src/lib/leads/dispatch-lead.ts`, `src/lib/ai/propose-lead-lots.ts`. Le produit comporte donc aussi une logique de plateforme d'apport de demandes, distincte du secrétariat.
2. **Accueil téléphonique.** Renvoi Twilio, initialisation ElevenLabs, disponibilités et réservation, transcription post-appel, compte rendu, classement et traitement dans `/app/appels`. Sources : `src/features/voice/artisan/tools.ts`, `src/lib/voice/process-voice-call-intake.ts`, `src/lib/appointments/voice-booking.ts`. Le rendez-vous vocal reste à confirmer par l'artisan.
3. **Fiche client et messagerie.** Clients locaux par artisan, comptes clients facultatifs, coordonnées, historique, fusion/dissociation, messages aux invités. Sources : `supabase/migration/49_clients_and_quote_response.sql`, `src/app/app/clients/actions.ts`, `src/lib/quotes/quote-response.ts`. Le prospect est représenté selon son origine dans `leads`, `voice_call_intakes` et/ou `clients`, plutôt que dans un pipeline CRM unique.
4. **Agenda.** Demandes vitrine/vocales, création artisan, confirmation/annulation, suivi par lien, horaires de visite et protection contre le chevauchement. Sources : `src/app/app/rdv/actions.ts`, migrations 21, 38 et 63. Pas de preuve dans les parcours examinés d'un planning multi-salariés avec ressources et trajets.
5. **Devis.** Saisie libre, catalogue de services et ouvrages, matériaux, marge, brouillon IA, modification dictée, duplication, envoi, PDF, acceptation/refus/rappel et preuve de signature. Sources : `src/app/app/quotes/actions.ts`, `src/lib/quotes/quote-response.ts`. L'édition de brouillon et l'envoi ultérieur existent, contrairement à la documentation métier ancienne.
6. **Chantiers et interventions.** Création depuis une référence devis, budget, saisie de temps, fournisseurs et bons d'intervention signés. Source : `src/app/app/chantiers/actions.ts`. La création reste une action séparée ; le modèle n'est pas un ERP de chantier complet.
7. **Factures et encaissement.** Facture standard, acompte, situation cumulative, solde, retenue, avoir, finalisation, PDF/Factur-X, Stripe Connect, relances et recouvrement externe. Sources : `src/lib/billing/create-btp-invoice.ts`, `src/app/app/invoices/btp-actions.ts`, `src/lib/billing/invoicing/invoice-service.ts`.
8. **Comptabilité.** Export CSV, pièces comptables, confirmation du destinataire comptable, récapitulatif et envoi périodique. Sources : `src/lib/accounting/monthly-export.ts`, `src/lib/accounting/accountant-confirmation.ts`. Centralisation/export vérifiés ; pas de grand livre ou de rapprochement bancaire complet identifié.
9. **Gestion du SaaS.** Inscription, import d'anciens documents, abonnement Stripe, quotas voix, numéros, notifications, administration, conciergerie commerciale, ambassadeurs et apporteurs. Sources : `src/lib/onboarding/import-quotes.ts`, `src/lib/voice/voice-overage-billing.ts`, migrations 30, 52, 64 et 66.

### 3.2 Architecture et dépendances

Monolithe Next.js/React : pages serveur, composants client, Server Actions et routes HTTP. PostgreSQL/Supabase porte l'identité, les données, RLS, triggers, RPC et Storage. `profiles` représente l'entreprise artisan et est lié à un utilisateur ; ce n'est pas une organisation avec membres/rôles d'équipe.

Les dépendances externes importantes sont Supabase, Stripe, Twilio, ElevenLabs, Mistral, Tavily, envoi e-mail/SMS, MySendingBox, RubyPayeur et les adaptateurs de plateforme de facturation. Sept tâches planifiées sont définies dans `vercel.json`. Les intégrations présentes dans le code ne prouvent ni les contrats, ni les configurations, ni les livraisons réelles.

Les actions authentifiées utilisent principalement le client Supabase soumis à RLS ; les webhooks, tâches et certains liens publics utilisent un client privilégié. Il faut donc maintenir deux protections complémentaires : appartenance à l'artisan dans les requêtes applicatives, et intégrité des relations dans PostgreSQL.

### 3.3 États et ruptures du cycle métier

- Devis : `draft → sent → accepted/rejected`. Édition et suppression du brouillon ; duplication pour repartir d'un document. Pas de gestion explicite d'avenant signé identifiée dans ce cycle.
- Rendez-vous : `pending → confirmed/cancelled`. La réservation de visite ne doit pas être confondue avec un engagement de réalisation du chantier.
- Facture : `draft → sent → paid/overdue`, avec états séparés de transmission et de recouvrement. Le statut payé ne représente pas un journal de plusieurs règlements.
- Chantier : actif/terminé/annulé ; relation devis↔chantier stockée dans les deux sens. Le chantier ne constitue pas automatiquement l'étape suivante d'un devis accepté.
- Avoir : document distinct à montant positif en base, interprété selon son type par certains moteurs. Tous les consommateurs ne traitent pas ce type correctement.

## 4. Points forts démontrés

- **Navigation recentrée sur les tâches quotidiennes** : quatre entrées principales dans `src/components/app/nav-items.ts`, outils secondaires dans « Plus ».
- **Fiche client sans compte obligatoire** : résolution par compte/e-mail/téléphone, jamais par nom seul, et vérification d'appartenance d'un `client_id` fourni. `resolve_client` et triggers de la migration 49. Cela réduit les doubles saisies, sans garantir l'absence de doublons en concurrence.
- **Prudence du téléphone** : pas de promesse de prix ni de diagnostic, règles de confirmation des coordonnées, mode message seul, contrôles serveur et identité des réservations. `src/lib/voice/soline-agent-prompt.ts`, `src/features/voice/artisan/tools.ts`, migration 63.
- **Import documentaire avec preuve** : chaque champ légal est rapproché du texte OCR ; SIRET et TVA subissent des contrôles déterministes. `verifyExtraction`, `src/lib/onboarding/verify-extraction.ts`. Bon modèle à étendre aux prix et faits extraits.
- **Durcissement SQL réel** : profils privés, vue publique limitée, protection de colonnes de facturation et de documents émis, restriction des fonctions publiques. Migrations 43–46 et 55. Les protections existent, même si leurs interactions restent à améliorer.
- **Franchise de TVA et certification des taux réduits** : migrations 51 et 58, `src/lib/billing/vat-certification.ts`. Ne pas répéter l'ancien constat « toujours 20 % » : il est faux pour la facture standard actuelle et la franchise encadrée en SQL.
- **Tests nombreux et rapides**, validation de schémas IA, vérification des signatures de webhooks, liens signés et protection CSV contre les formules. Cela fournit une base utile pour corriger sans réécriture.

## 5. Anomalies confirmées et risques prioritaires

### F01 — HT/TTC divergent entre paiement, export et document — P0, confirmé

**Preuves :** `src/app/compte/factures/actions.ts:79`, `startInvoicePayment`, affecte `invoice.grand_total` à `unit_amount`. L'en-tête est alimenté en HT par `src/app/app/invoices/actions.ts:109`. Le PDF et `buildEReportingPayload` ajoutent la TVA des lignes. `src/app/api/webhooks/stripe/route.ts:35`, `markInvoicePaidFromSession`, compare encore au HT. `src/lib/accounting/invoices-csv.ts:44` nomme la colonne « Total TTC centimes » mais exporte le même en-tête.

**Scénario :** facture de 1 000 € HT à 20 %, sans retenue : PDF à 1 200 €, checkout à 1 000 €, facture marquée payée à 1 000 €, export annoncé TTC à 100 000 centimes. Les relances utilisent aussi le HT. Pour une entreprise en franchise, cet exemple ne produit pas d'écart de taxe.

**Impact :** sous-encaissement, faux solde et travail de correction comptable. **Correction proposée :** source unique des totaux HT/TVA/TTC et du reste dû, utilisée par PDF, paiement, relance, recouvrement et CSV. Tester les consommateurs ensemble. **Effort : 3–5 j.**

### F02 — Envoi du devis avant écriture de ses lignes — P0, confirmé dans le code et le SQL

**Preuves :** `createQuote`, `src/app/app/quotes/actions.ts:479`, insère `status: d.quoteStatus` puis appelle `writeQuoteLines` ; `updateQuote:583` change le statut avant suppression/réinsertion des lignes à 618. Le mode `send` existe dans le formulaire. `guard_quote_lines_integrity`, `supabase/migration/55_security_hardening.sql:626`, refuse toute écriture des lignes si le parent n'est plus `draft`.

**Scénario :** créer un devis avec fournitures et « envoyer » : en-tête `sent`, insertion de lignes refusée si migration 55 appliquée. Modifier et envoyer un brouillon : nouvel en-tête, anciennes lignes verrouillées, erreur lors de la réécriture. Le parcours « enregistrer brouillon puis envoyer séparément » peut éviter cette séquence ; cela ne répare pas l'autre parcours.

**Impact :** devis incohérent/bloqué et artisan forcé de recommencer. **Correction :** création/édition atomique de l'ensemble en brouillon, puis transition d'envoi ; test d'intégration sous rôle `authenticated`. **Effort : 2–4 j.** Aucune tentative en base réelle effectuée.

### F03 — Retenue et prorata ne réconcilient pas les lignes — P0, confirmé arithmétiquement

**Preuves :** `createInvoiceFromQuote`, `src/app/app/invoices/actions.ts:70`, calcule la MO sur `remaining` ; les matériaux à 170 sont calculés sur `billableRemaining`, après retenue. Pas de réconciliation des lignes avant finalisation dans `InvoiceService.finalize`.

**Scénario :** devis 2 000 € HT, MO 1 200 €, matériaux 800 €, déjà facturé 1 000 €, retenue configurée 5 %. En-tête solde : 950 €. Ligne MO : 600 €, matériaux : 380 €, total lignes : 980 €. Le démonstrateur local reproduit 30 € d'écart. Même sans retenue, les arrondis indépendants peuvent produire quelques centimes de différence.

**Correction :** séparer facturation et exigibilité de la retenue avec validation comptable ; répartir les arrondis et bloquer toute divergence d'en-tête/lignes. **Effort : 3–5 j**, partagé avec F01.

### F04 — Acomptes et avoirs perdent la ventilation de TVA — P1, confirmé

**Preuves :** `createTypedInvoiceFromQuote`, `src/lib/billing/create-btp-invoice.ts:99`, crée une ligne au `quote.reduced_vat_rate`. `createCreditNoteFromInvoice`, `src/app/app/invoices/btp-actions.ts:44`, récupère le taux du devis plutôt que les lignes de la facture source.

**Scénario :** facture 500 € à 10 % + 500 € à 20 % = 1 150 € TTC. Avoir intégral créé au taux global 10 % = 1 100 € TTC. Une correction manuelle du taux de la facture n'est pas non plus reprise par l'avoir. L'acompte d'un devis mixte subit le même problème de simplification.

**Correction :** ventilation par taux/catégorie et reprise exacte de la facture créditée ; ne pas déduire la taxe d'un document antérieur mutable. **Effort : 2–4 j.**

### F05 — Cumul facturé, brouillons et avoirs mélangés — P1, confirmé ; concurrence probable

**Preuves :** `sumInvoicedOnQuote`, `src/lib/billing/create-btp-invoice.ts:27`, additionne toutes les factures sans filtrer statut/finalisation et déduit tous les avoirs. Les erreurs de lecture ordinaires retombent sur zéro. `createCreditNoteFromInvoice` ne vérifie pas l'existence d'un autre avoir ; aucune unicité correspondante trouvée dans les migrations. Création en-tête/lignes séparée.

**Scénarios caractérisés en mémoire :** un avoir brouillon de 1 000 € annule immédiatement le cumul d'une facture émise de 1 000 € ; une panne de lecture renvoie zéro ; une insertion de lignes échouée laisse un acompte brouillon compté dans le solde. Deux demandes simultanées peuvent chacune lire le même reste et le dépasser ; ce dernier scénario n'a pas été joué sur PostgreSQL.

**Correction :** distinguer réservé en brouillon, facturé net émis et encaissé ; transaction verrouillant le devis pour réserver/créer ; contrôle des avoirs cumulés sur la source ; erreur explicite si cumul inconnu. **Effort : 3–5 j.**

### F06 — Avoir relancé et potentiellement payable comme une facture — P0, confirmé

**Preuves :** `runInvoiceReminders` et `sendManualInvoiceReminder`, `src/lib/billing/invoice-reminders.ts:22`, filtrent les statuts mais pas `invoice_type` ni les crédits associés. `startInvoicePayment` ne sélectionne pas le type. L'avoir finalisé obtient un statut `sent` et une échéance via `InvoiceService.finalizeB2C`.

**Scénario :** avoir de 1 000 € créé pour annuler une facture ; l'avoir puis éventuellement la facture d'origine restent éligibles à relance. Un client lié peut être invité à régler l'avoir positif. Aucun remboursement Stripe automatique n'est déclenché par la création de l'avoir.

**Correction :** créance nette et sens comptable explicites ; exclure les avoirs des demandes de paiement ; traiter compensation/remboursement séparément. **Effort : 2–3 j**, après F01/F05.

### F07 — Facture en retard impossible à payer et paiement tardif perdu — P1, confirmé

**Preuves :** `startInvoicePayment` accepte uniquement `sent`. `markInvoicePaidFromSession` met à jour uniquement `.eq("status", "sent")`. Le cron passe à `overdue` ; ses mises à jour ne recontrôlent pas le statut lu précédemment.

**Scénario :** le client ouvre le checkout avant minuit, le cron classe en retard, le webhook arrive après : paiement reçu mais mise à jour de statut sans ligne affectée. À l'inverse, une facture payée entre lecture et écriture du cron peut repasser en retard. Le webhook ne renseigne pas `payment_received_at` dans ce chemin.

**Correction :** paiements idempotents enregistrés indépendamment du statut, transition atomique depuis `sent/overdue`, contrôle du résultat et relance sur reste dû. **Effort : 2–4 j.**

### F08 — E-reporting « soumis » sans transmission — P0 pour toute promesse de transmission, confirmé en mémoire

**Preuves :** `createEReportingSubmitter`, `src/lib/billing/invoicing/e-reporting-submitter.ts:62`, utilise un no-op sans API. `runEReportingSubmission`, `src/lib/billing/invoicing/run-e-reporting.ts:70`, marque quand même `submitted`. Le test d'audit reproduit `submittedTransactions=1` et `skippedNoop=true` sur la même entrée fictive.

**Scénario :** config absente, cron sur une vraie file : dossiers sortis des éléments `pending` sans preuve de transmission. Le test préexistant no-op n'utilise qu'une file vide. Les erreurs deviennent `failed`, tandis que le worker ne reprend que `pending` ; un crash après `batched` peut également laisser une entrée bloquée.

**Correction :** mode simulation distinct ; ne jamais consommer la file réelle en no-op ; reprise bornée et identifiant de transmission persisté ; prise en charge atomique des lots. **Effort : 2–4 j.** La configuration de production n'a pas été vérifiée.

### F09 — Identité B2B confondue avec possession d'un numéro de TVA — P1, confirmé

**Preuves :** `isB2BCustomer`, `src/lib/billing/invoicing/classify-customer.ts:20`, exige SIREN/SIRET et TVA valide. `resolveCustomerClassification` considère tout client sans compte ou profil disponible comme B2C. La fiche `clients` de la migration 49 ne porte pas les identifiants légaux acheteur. `B2B_INVOICING_FROZEN=true` dans `src/lib/billing/invoicing-freeze.ts:34`.

**Scénario :** professionnel en franchise avec SIREN mais sans numéro de TVA, ou entreprise saisie seulement par e-mail : considéré particulier, avec routage e-reporting et contournement involontaire du gel B2B. Le cas SIREN seul est caractérisé localement.

**Correction :** nature du client explicite et état « à compléter », pays/assujettissement distincts de la validité technique des identifiants ; conserver ces données dans la fiche artisan sans imposer un compte client. **Effort : 3–5 j.** Le périmètre fiscal exact doit être validé ; la DGFiP précise que les franchisés restent concernés par la réforme.

### F10 — PDF de facture reconstruit à partir de données vivantes — P1, confirmé

**Preuves :** `loadFacturXDocumentFromDb`, `src/lib/billing/facturx/load-from-db.ts:95`, recharge profils vendeur et acheteur, utilise `created_at` comme date d'émission. `src/app/api/invoices/[invoiceId]/pdf/route.ts:58` regénère le PDF à chaque téléchargement. `finalizeB2C` génère le document avant de calculer et persister son échéance.

**Scénario :** modification d'adresse, d'assurance ou de nom d'entreprise après émission : un nouveau téléchargement peut changer. Brouillon créé en décembre et finalisé en janvier : date du brouillon et année du numéro peuvent diverger. Premier PDF sans échéance stockée, téléchargement suivant avec échéance.

**Correction :** figer identité, mentions, date, échéance, lignes et rendu au moment d'émission ; servir l'archive ensuite. Le gel des seules lignes ne suffit pas. **Effort : 4–6 j.**

### F11 — Duplication de devis perd des propriétés économiques — P1, confirmé

**Preuves :** `duplicateQuote`, `src/app/app/invoices/btp-actions.ts:154`, copie les totaux de l'en-tête et les matériaux mais omet notamment `exclude_from_invoice` et les références fournisseur ; ne reprend pas toutes les conditions de validité/rétractation.

**Scénario :** fourniture achetée directement par le client, exclue du premier devis : la copie reprend sa ligne sans exclusion, avec un total copié qui ne l'incluait pas. Selon le recalcul suivant, le PDF ou l'enregistrement peut réintégrer ce coût.

**Correction :** copie métier explicite et recalcul unique ; test de duplication avec achat direct, unités décimales, TVA et conditions. **Effort : 1–2 j.**

### F12 — Relations entre entreprises insuffisamment contraintes — P1, défaut structurel confirmé, exploitabilité à vérifier

**Preuves :** `addTimeEntry` et `createWorkOrder`, `src/app/app/chantiers/actions.ts:65`, prennent des références sans vérifier le propriétaire du parent. `project_time_entries_artisan_all`, migration 06:178, contrôle seulement `artisan_id` de la ligne. La FK `project_id` référence l'ID du chantier sans contrainte composite d'entreprise. Même schéma de vigilance pour les liens de bons/devis.

**Scénario :** artisan A soumet un ID de chantier B connu avec son propre `artisan_id` : le schéma autorise une relation incohérente. Cela ne démontre pas la lecture des données de B, ni une fuite généralisée : la RLS de lecture demeure une protection.

**Correction :** vérifier parent et enfant dans la même entreprise, idéalement contrainte composite ou trigger ciblé ; tests de deux artisans sur PostgREST. **Effort : 2–3 j.**

### F13 — Suppression de compte efface les pièces métier à J+30 — P1, comportement confirmé ; responsabilité à valider

**Preuves :** `purgeDueAccountDeletions`, `src/lib/account/account-deletion.ts:188`, efface les pièces Storage puis le profil, avec cascades documentées ; les factures conservées mentionnées dans ce fichier sont celles de l'abonnement Soline, pas les factures émises par l'artisan. La politique de confidentialité décrit également cette règle.

**Scénario :** artisan résilié, contrôle ou litige ultérieur : ses pièces ne sont plus récupérables depuis Soline. Le comportement peut être contractuellement acceptable avec export et conservation ailleurs ; ce n'est pas démontré ici.

**Correction proposée :** organiser export complet vérifiable et politique de conservation/archivage approuvée avant purge ; ne pas mélanger données commerciales dispensables et preuves comptables. **Effort : 3–6 j**, hors avis juridique et stockage. La conservation des factures incombe aux entreprises pendant 10 ans ; la répartition précise des responsabilités SaaS doit être contractualisée.

### F14 — Assistant de messagerie utilise le début de conversation — P2, confirmé

**Preuves :** `src/app/api/ai/suggest-reply/route.ts:55` trie par date croissante et limite à dix messages. `src/app/api/ai/suggest-quote-notes/route.ts` emploie la même construction.

**Scénario :** après quinze échanges, le client a changé la date ou annulé son besoin dans les derniers messages ; la suggestion raisonne sur les premiers. **Correction :** derniers messages remis en ordre chronologique, résumé des décisions antérieures et statut actuel. **Effort : 0,5–1 j.**

### F15 — Deux corrections IA interprètent différemment le TTC — P1, confirmé

**Preuves :** `QUOTE_PATCH_SYSTEM_PROMPT`, `src/lib/quotes/voice-patch.ts:72`, refuse de convertir un montant TTC et le place en `unresolved`. `FORM_PATCH_SYSTEM_PROMPT`, `src/lib/quotes/form-patch.ts:94`, impose une division par 1,2 et signale ensuite l'incertitude. `describeSnapshot` ne fournit pas les taux de chaque ligne.

**Scénario :** « mets cette ligne à 110 € TTC » sur une prestation à 10 % : le deuxième prompt demande 91,67 € HT au lieu de 100 €. Une alerte n'annule pas nécessairement l'opération proposée. **Correction :** conversion déterministe avec le taux réel, ou question bloquante ; contrat commun aux deux interfaces. **Effort : 1–2 j.**

### F16 — Fiabilité des événements téléphoniques et traçabilité du prompt — P1, risques probables

**Preuves :** `src/app/api/webhooks/elevenlabs/post-call/route.ts:17` prévoit une réponse 200 malgré un échec métier journalisé. Pas de boîte de réception durable avant traitement dans cette route. `initResponse`, `src/app/api/voice/elevenlabs/init/route.ts:95`, injecte le prompt du dépôt seulement avec l'override ; `prompt_version` reste alimenté depuis la constante du code.

**Scénarios :** panne d'écriture pendant un compte rendu → fournisseur acquitté sans dossier disponible ; override inactif → conversation pilotée par le prompt console mais étiquetée avec la version du dépôt. Les paramètres de production et mécanismes externes de reprise sont inconnus.

**Correction :** conserver l'événement signé avant acquittement, reprise idempotente ; journaliser source et empreinte du prompt effectif, vérifier l'override au déploiement. **Effort : 2–4 j.**

### F17 — Coût et latence IA insuffisamment bornés au niveau du parcours — P2, risque probable

**Preuves :** `buildQuoteFromText` enchaîne métré, extraction, recherche/matching et estimation ; `estimateMaterialUnitPrices`, `src/lib/ai/quote-material-unit-pricing.ts:84`, lance des recherches par matériau ; `mistralChatParse` peut faire deux tentatives. Route assistant limitée à 60 s, chat Mistral à 25 s par appel, Tavily à 12 s par recherche.

**Scénario :** plusieurs étapes lentes ou une réponse JSON invalide peuvent épuiser le délai global alors que chaque appel respecte son propre timeout. L'authentification et l'abonnement ne constituent pas un plafond de dépenses par artisan ; aucun tel plafond trouvé dans la route assistant.

**Correction :** budget global de durée et coût, réutilisation du métré structuré, cache de prix datés, limitation de concurrence et résultat partiel explicite. **Effort : 2–4 j.** Pas de coût réel en euros ni de p95 mesuré pendant cet audit.

### F18 — Protection de débit permissive et non atomique — P2, confirmé dans le code

**Preuves :** `consumeRateLimit`, `src/lib/security/rate-limit.ts:49`, fait comptage puis insertion séparés ; client absent ou erreur de lecture → autorisé. L'erreur d'insertion n'est pas bloquante.

**Scénario :** rafale parallèle sous le seuil, ou panne du contrôle : appels IA publics supplémentaires. **Correction :** compteur atomique ; dégradation maîtrisée du service payant si contrôle indisponible, en conservant la réception d'un message sans IA. **Effort : 1–2 j.**

### F19 — Rentabilité et chantier donnent une précision trompeuse — P2, confirmé/recommandation

**Preuves :** `computeQuoteMarginPreview`, `src/lib/billing/quote-margin.ts:8`, valorise par défaut MO et matériaux à 65 % du prix de vente ; si HT = MO + matériaux, la marge vaut presque toujours 35 %. `createProject` lit les ventilations du devis mais inscrit les budgets MO/matériaux à zéro. `addTimeEntry` prend par défaut le taux de vente horaire comme coût.

**Scénario :** artisan qui augmente le prix d'un matériau voit une marge indicative sans renseignement de son achat réel ; suivi de chantier qui confond taux vendu et coût du travail. Le caractère indicatif est documenté : ce n'est pas un calcul comptable avéré.

**Correction :** masquer une marge non fondée, afficher l'information manquante, reprendre les postes du devis et distinguer coût/vente. **Effort : 2–3 j.**

### F20 — Documentation périmée favorisant les régressions — P2, confirmé

**Preuves :** `docs/business-rules.md` dit qu'il n'y a pas d'édition ou d'envoi ultérieur de devis, que tous les taux deviennent 20 % et que les avoirs sont exclus du cumul. Le code actuel contredit ces trois affirmations. `docs/database-schema.md` décrit encore une lecture publique de profils alors que les migrations 44–46 la restreignent.

**Scénario :** un développeur corrige un ancien défaut et casse un garde-fou actuel ou estime le produit sur un mauvais état. **Correction :** document court daté, invariants liés à leurs tests et liste réelle des migrations ; archiver les anciens diagnostics comme historiques. **Effort : 1 j.**

### F21 — Réessais de finalisation après effet externe — P1, risque probable

**Preuves :** `InvoiceService.finalize` reprend un claim après deux minutes ; `finalizeB2B` soumet avant persistance finale et garde le claim en cas d'échec local, mais cette protection expire. `allocate_invoice_number` alloue un nouveau numéro à chaque appel. En B2C, insertion de file puis mise à jour de facture sont séparées.

**Scénario :** transmission réussie, persistance échouée, nouvel essai après deux minutes : réémission possible ou reprise bloquée par la file déjà créée. L'impact B2B est actuellement limité par le gel explicite ; il doit être traité avant sa levée.

**Correction :** tentative persistée avec numéro stable et clé d'idempotence, reprise de la tentative existante et rapprochement de l'accusé externe. **Effort : 2–4 j.** Ne pas ajouter un orchestrateur distribué pour ce seul besoin.

## 6. Cohérence produit, métier et simplification

### 6.1 Parcours cible minimal

Une demande arrive → une fiche identifiée → une prochaine action → un devis vérifié → une acceptation prouvée → une facture exacte → un règlement rapproché → des pièces exportables. Les modules nécessaires existent en grande partie. La priorité est de transmettre correctement l'information et l'état entre eux.

**Doubles saisies restantes démontrables :** `createProject` attend nom et client séparément même avec devis ; `createWorkOrder` attend à nouveau client/adresse/titre ; le chargeur de facture cherche l'adresse dans `customer_profiles` sans reprendre celle de la fiche `clients`. Pour un client sans compte, renseigner l'adresse dans « Clients » ne suffit donc pas à alimenter le document facture. Reprendre les valeurs existantes avec possibilité de distinguer adresse de facturation et chantier.

**Doublons de référentiels :** `services`, `work_items`, catalogue plateforme, recettes et produits fournisseurs remplissent des rôles différents mais voisins. Clarifier pour l'artisan : « ce que je vends », « mes fournitures » et « mes prix habituels ». Garder les recettes internes ; ne pas demander de configurer cinq catalogues. Les deux moteurs de patch IA doivent partager leurs règles monétaires même si les interfaces restent distinctes.

**Clients et prospects :** la fiche unifiée est une bonne base ; ne pas ajouter un CRM lourd. Une demande a surtout besoin d'un responsable, d'une prochaine action et d'un état « à rappeler / devis à préparer / en attente / clos ». La fusion par téléphone peut mélanger des membres d'un foyer et la résolution sans verrou peut créer des doublons simultanés : garder fusion/dissociation explicites, éviter une fusion irréversible automatique.

### 6.2 Besoins bâtiment insuffisamment couverts

- **Règlements partiels, plusieurs moyens de paiement, remboursements.** Les chemins examinés pilotent essentiellement un statut et un montant global. Introduire un petit journal de règlements avant une intégration bancaire complexe.
- **Avenants et annulations après signature.** La duplication existe, mais n'établit pas le lien juridique/économique d'un avenant au marché initial. Définir une référence et une nouvelle acceptation, sans rouvrir silencieusement le devis signé.
- **Situations.** Pourcentages globaux implémentés ; pas de preuve de situation cumulative par poste avec détail de l'avancement. À n'étendre que si les entreprises pilotes le demandent.
- **Retenue, réception et réserves.** Le modèle actuel soustrait un montant à facturer et crée une facture de libération ; ce traitement doit être décidé avec l'expert-comptable selon les marchés. Pas de suggestion de généraliser une retenue à tous les artisans.
- **Sous-traitance/autoliquidation et clients publics.** Présence de tables/identifiants ne prouve pas un parcours fiscal et administratif complet. Les taux autorisés et catégories actuelles ne suffisent pas à démontrer la prise en charge. À traiter comme périmètre à qualifier, pas comme fonctionnalité acquise.
- **Travail à plusieurs.** Un profil lié à un compte ne prouve pas un mode équipe ; salariés, droits, absences et partage de planning doivent être décidés selon la cible. Ne pas construire du multi-équipe avant validation commerciale.

### 6.3 Informations demandées et utilité

Nom/métier/zone/horaires servent immédiatement au téléphone et au routage ; nom, coordonnées et nature de demande servent au rappel ; adresse chantier et dimensions servent au devis ; identité légale/régime TVA/assurances servent à l'émission. L'import OCR réduit le coût de renseignement de ces dernières.

Demander les coordonnées légales au moment utile avec reprise d'un document est préférable à un long onboarding. Le téléphone suit déjà cette logique. Le questionnaire IA impose en revanche un nombre minimal d'échanges même quand le premier message est riche : remplacer progressivement le comptage par les champs réellement manquants. Le blocage décennale dans `validateQuoteLegalProfile` n'est pas conditionné à la nature des travaux : faire valider les cas de métier où il gêne inutilement une émission.

### 6.4 Orientation stratégique recommandée

Prioriser trois preuves de valeur : appels récupérés, délai de rappel, délai de production d'un devis exploitable. Garder marketplace, conciergerie et apporteurs comme modules secondaires tant que leur valeur n'est pas mesurée. Aucune preuve dans le dépôt ne permet de conclure à une rentabilité commerciale, un taux de conversion ou une réduction réelle de temps administratif.

Proposer à cinq artisans pilotes des tâches identiques, avec leurs documents anonymisés : traiter un appel, retrouver un client, corriger un devis mixte, enregistrer un virement partiel, annuler par avoir. Mesurer temps, erreurs et aide nécessaire ; ne pas se limiter à un avis général sur l'interface.

## 7. IA et prompts

L'inventaire détaillé figure dans `PROMPTS.md` : **18 ensembles de consignes exécutables**, dont le wrapper JSON commun et le couple accueil/prompt vocal. Les textes d'accueil de repli et consignes temporelles des outils sont également recensés. Aucun registre de prompts métier en SQL ni fonction Edge séparée n'a été identifié dans les fichiers examinés. Cela ne couvre pas le contenu de la base ou de la console ElevenLabs non accessibles.

Principaux risques : génération de prix obligatoires même sans source, affirmations absolues sur des ouvrages techniques, connaissances normatives non sourcées, documents/messages/web non fiables mélangés aux consignes, modèles `latest` dont le comportement peut changer. Une sortie JSON valide n'est pas une preuve de justesse métier. Les tests anti-injection existants de compte rendu utilisent des réponses simulées ; ils prouvent le cloisonnement et la validation du format, pas la résistance réelle du modèle.

Conserver en code les invariants, schémas, droits des outils, calculs, règles de conversion, gestion d'erreur et tests. Rendre configurables des **données structurées** : prestations, zone, ton, horaires, tarifs personnels et recettes approuvées. Un registre de variantes administrateur en base ne devient utile qu'avec responsable, validation, version, rollback et mesure ; il ne faut pas transformer les règles de sécurité en texte libre éditable par chaque artisan.

## 8. Sécurité et conformité à valider séparément

### 8.1 Sécurité technique

Les signatures de webhooks, liens signés, contrôles d'appartenance et durcissements RLS sont des points positifs. Ils ne dispensent pas des tests sous rôles réels, notamment F02 et F12. Les clients privilégiés doivent rester côté serveur ; une erreur d'identité ou de filtre peut contourner les protections dont bénéficie le client utilisateur.

Pas de fuite inter-entreprises exploitée pendant cet audit. Pas d'analyse de vulnérabilités des dépendances publiée comme complète : versions de dépendances lues, mais pas d'inventaire CVE fiable exécuté. Les contraintes de téléchargement/logo sont testées dans le dépôt, sans exercice de SSRF réel. La gestion des liens publics doit être testée avec expiration, rejeu et changement d'état, pas seulement avec un jeton valide.

### 8.2 Points juridiques/comptables — aucune conformité certifiée

1. **Facturation électronique.** Au 4 novembre 2026, la réception concerne déjà les entreprises dans le champ ; émission PME/micro et e-reporting associés suivent le calendrier 2027. Le gel B2B est un choix produit de préparation, pas la preuve que toute facture B2B d'un artisan doit aujourd'hui être interdite. Faire confirmer taille, territoire, assujettissement, opérations et PA réellement raccordée. Sources : [DGFiP — franchise en base et réforme](https://www.impots.gouv.fr/professionnel/questions/franchise-en-base-micro-entrepreneur-ou-auto-entrepreneur-suis-je-concerne), [Ministère de l'Économie — réforme](https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises).
2. **TVA bâtiment.** Le remplacement de l'attestation par une mention est pris en compte, ce qui est un progrès ; l'éligibilité du chantier, les travaux énergétiques et achats directs restent à contrôler. Faire valider taux mixtes, acompte, avoir et exigibilité : `DEFAULT_INVOICE_EINVOICING` combine prestation de services et `on_delivery`. Source : [Service Public — mention TVA](https://entreprendre.service-public.fr/actualites/A18088). Ne pas déduire l'éligibilité d'une seule case cochée.
3. **Documents et preuve.** Numérotation par série, date d'émission, archivage, avoir, identité acheteur, retenue et continuité des séries nécessitent une validation. Un PDF embarquant du XML ne constitue pas à lui seul une certification ni une transmission réussie. Sources : [Service Public — facturation et conservation](https://entreprendre.service-public.gouv.fr/vosdroits/F23208), [DGCCRF — devis](https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/devis).
4. **Rétractation et urgence.** `buildQuoteRetractionLines` emploie une référence au 3° de L221-28 pour l'exécution complète ; la rédaction et la base légale doivent être revues. Distinguer demande de commencement anticipé, perte du droit après exécution et urgence strictement nécessaire. Vérifier aussi le dispositif applicable aux contrats conclus en ligne depuis juin 2026, non démontré par le formulaire papier. Sources : [Service Public — dépannage](https://www.service-public.gouv.fr/particuliers/vosdroits/F38350), [DGCCRF — délais de rétractation](https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/delais-de-reflexion-ou-de-retractation-comment-sappliquent-t-ils).
5. **Téléphone et données personnelles.** L'accueil du code annonce une IA ; cela ne vaut pas information complète sur enregistrement/transcription, finalité, destinataires, durée, droits et transferts. Vérifier l'annonce réellement jouée, contrats fournisseurs, rétention audio/transcription et purge. Source : [CNIL — information des appelants](https://cnil.fr/fr/cnil-direct/question/enregistrement-ou-ecoute-des-conversations-telephoniques-faut-il-informer-ses). Aucun délai universel de conservation audio n'est affirmé ici.
6. **Assurances, médiation, pénalités et recouvrement.** Adapter mentions au métier, au client particulier/professionnel et au marché. Faire valider les déclenchements automatiques et le montant réellement dû avant mise en demeure ; ne pas automatiser un recouvrement sur un statut isolé.

## 9. Feuille de route priorisée

### Lot A — sécuriser le cœur commercial et financier, environ 8–12 j

- F02 : écriture transactionnelle des devis et envoi après validation.
- F01/F03/F04 : calcul partagé, taxes ventilées et cohérence des montants ; validation comptable des exemples avant mise en service.
- F06/F07 : empêcher paiement/relance d'avoir, accepter le paiement d'une facture échue, enregistrer les règlements de façon idempotente.
- Critère de sortie : même TTC partout, aucun état `sent` avec lignes incomplètes, aucun avoir dans une relance, tests de concurrence/paiement tardif verts.

### Lot B — fiabiliser états, documents et intégrations, environ 8–12 j

- F05/F21 : cumul net, transactions, reprises stables sans double émission.
- F08/F09 : simulation distincte et classification client explicite ; ne pas lever le gel B2B sur la seule présence d'une clé API.
- F10 : archive fidèle et datation cohérente.
- F12/F13 : relations inter-entreprises et stratégie d'export/conservation validée.
- Critère de sortie : scénarios de panne/rejeu documentés, dossier émis identique après changement de profil, recette SQL à deux entreprises, preuve d'export récupérable.

### Lot C — diminuer les corrections manuelles, environ 4–7 j

- F11/F14/F15 : duplication fidèle, historique récent, un seul traitement monétaire des commandes IA.
- F16 : événement vocal durable et version effective du prompt.
- Préremplir chantier/intervention/adresse de facturation ; harmoniser les messages d'erreur. F20 : remettre à jour le contrat métier documentaire.
- Critère de sortie : demande → devis sans ressaisie du client, reprise d'un appel après erreur, devis copié identique hors références et statut.

### Lot D — optimiser après mesure, environ 4–7 j

- F17/F18 : budgets de ressources et contrôle atomique de débit.
- F19 : rentabilité fondée sur des données ou signalée indisponible.
- Évaluations IA sur corpus métier ; simplification des questions ; décider des fonctions équipe/avenants détaillés sur retours pilotes.
- Critère de sortie : mesure du temps gagné et des corrections, latence et coût par parcours connus, pas seulement nombre de générations.

Ordre conseillé : une chaîne fiable avant une nouvelle fonctionnalité. Aucun besoin démontré de microservices, d'agent IA généraliste doté de pouvoirs supplémentaires ou de refonte complète de la base.

## 10. Questions à trancher avec les responsables métier

1. Le pilote vise-t-il exclusivement des artisans seuls travaillant pour des particuliers, ou aussi entreprises, syndics et marchés publics ?
2. Quelle preuve écrite existe de la validation comptable annoncée dans les commentaires, et quels cas couvre-t-elle ?
3. Qui fournit la réception des factures électroniques et quelle plateforme est effectivement contractualisée/configurée ?
4. Comment doivent se traiter acomptes annulés, règlements partiels, remboursement d'avoir et compensation entre documents ?
5. Quels marchés utilisent réellement la retenue de garantie, avec quelle assiette et quelle réception ?
6. Le client peut-il conserver tous ses documents hors de Soline avant clôture, et qui porte la conservation après résiliation ?
7. Quel est le prompt effectif ElevenLabs, quels overrides sont actifs, quelles données audio sont conservées et pour combien de temps ?
8. L'artisan attend-il un prix indicatif de marché, son propre prix de vente ou un prix fournisseur vérifiable ? Quel niveau d'invention est acceptable dans un brouillon ?
9. À quel moment une demande est-elle abandonnée, relancée ou considérée convertie, et qui valide cette transition ?
10. Les situations par poste, remises, avenants et planning salariés sont-ils indispensables aux premiers utilisateurs ou hors périmètre assumé ?

**L'audit s'arrête à ces conclusions. Toute correction du projet, de sa base, de ses prompts actifs ou de sa configuration doit faire l'objet d'une autorisation ultérieure.**
