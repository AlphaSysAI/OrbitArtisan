import type { Metadata } from "next";
import Link from "next/link";

import { LegalPageShell } from "@/components/legal/legal-page-shell";
import {
  formatPriceHtEur,
  FORMAL_NOTICES_INCLUDED_PER_MONTH,
  SOLINE_RECHARGE_PACKS,
  SUBSCRIPTION_PLANS,
} from "@/lib/billing/subscription-plans";
import { LEGAL_PUBLISHER } from "@/lib/legal/site-legal-info";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
  description: `Conditions générales de vente de l'abonnement ${LEGAL_PUBLISHER.productName}.`,
};

export default function CgvPage() {
  return (
    <LegalPageShell title="Conditions générales de vente (CGV)">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">1. Objet et champ d&apos;application</h2>
        <p>
          Les présentes Conditions Générales de Vente (ci-après « CGV ») régissent la souscription et la
          fourniture de l&apos;abonnement au service <strong>{LEGAL_PUBLISHER.productName}</strong>, édité par{" "}
          <strong>{LEGAL_PUBLISHER.companyName}</strong> ({LEGAL_PUBLISHER.legalForm}), {LEGAL_PUBLISHER.address}{" "}
          (SIRET : {LEGAL_PUBLISHER.siret}).
        </p>
        <p>
          Elles s&apos;appliquent aux professionnels du bâtiment qui souscrivent un abonnement via{" "}
          {LEGAL_PUBLISHER.appDomain}. L&apos;utilisation du service est en outre soumise aux{" "}
          <Link href="/cgu" className="text-orange-600 underline-offset-2 hover:underline">
            Conditions générales d&apos;utilisation (CGU)
          </Link>
          .
        </p>
        <p>
          Toute souscription vaut acceptation sans réserve des présentes CGV et des CGU. En cas de contradiction,
          les CGV prévalent pour les aspects commerciaux et tarifaires de l&apos;abonnement.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">2. Offres et tarifs</h2>
        <p>Les offres d&apos;abonnement en vigueur au moment de la souscription sont les suivantes (prix HT) :</p>
        <ul className="list-disc space-y-2 pl-5">
          {SUBSCRIPTION_PLANS.map((plan) => (
            <li key={plan.id}>
              <strong>Plan {plan.name}</strong> — {formatPriceHtEur(plan.priceMonthlyHtEur)} € HT / mois ou{" "}
              {formatPriceHtEur(plan.priceAnnualHtEur)} € HT / an :{" "}
              {plan.solineMinutesIncluded > 0
                ? `SaaS BTP complet + Soline (${plan.solineMinutesIncluded} min d'appels incluses / mois).`
                : "SaaS BTP complet, sans secrétaire vocale Soline."}
            </li>
          ))}
          <li>
            <strong>Essai gratuit</strong> : 15 jours sans carte bancaire, sous réserve des conditions affichées
            lors de l&apos;inscription.
          </li>
        </ul>
        <p>
          Chaque offre comprend l&apos;envoi de{" "}
          <strong>
            {FORMAL_NOTICES_INCLUDED_PER_MONTH} mise en demeure par lettre recommandée avec accusé de réception
            par mois civil
          </strong>
          , affranchissement inclus. Au-delà de ce quota, les frais d&apos;affranchissement du courrier recommandé
          restent à la charge de l&apos;artisan et lui sont refacturés au tarif postal en vigueur, sans marge. Un
          envoi payant n&apos;est déclenché qu&apos;après acceptation expresse du surcoût par l&apos;artisan.
        </p>
        <p>Des packs de recharge de minutes Soline sont disponibles à l&apos;achat depuis l&apos;espace artisan :</p>
        <ul className="list-disc space-y-2 pl-5">
          {SOLINE_RECHARGE_PACKS.map((pack) => (
            <li key={pack.id}>
              <strong>{pack.label}</strong> : {pack.priceHtEur} € HT — {pack.minutes} minutes d&apos;appels
              créditées sur le compte.
            </li>
          ))}
        </ul>
        <p>
          Les prix sont exprimés en euros hors taxes. La TVA applicable est ajoutée au moment de la facturation
          conformément à la réglementation en vigueur.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">3. Commande et souscription</h2>
        <p>
          La souscription s&apos;effectue en ligne depuis l&apos;espace artisan, après création de compte. Le
          contrat est conclu lors de la validation du moyen de paiement et de la confirmation de l&apos;abonnement
          par {LEGAL_PUBLISHER.companyName}.
        </p>
        <p>
          L&apos;artisan garantit être un professionnel agissant dans le cadre de son activité commerciale ou
          artisanale et disposer du pouvoir de contracter.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">4. Durée, renouvellement et résiliation</h2>
        <p>
          L&apos;abonnement est conclu pour une durée mensuelle ou annuelle selon l&apos;offre choisie. Il est
          renouvelé tacitement pour une période de même durée, sauf résiliation par l&apos;artisan avant la date
          d&apos;échéance.
        </p>
        <p>
          L&apos;artisan peut résilier à tout moment depuis son espace utilisateur ou par e-mail à{" "}
          <a href={`mailto:${LEGAL_PUBLISHER.email}`} className="text-orange-600 underline-offset-2 hover:underline">
            {LEGAL_PUBLISHER.email}
          </a>
          . La résiliation prend effet à l&apos;issue de la période en cours ; aucun remboursement au prorata
          n&apos;est dû pour la période déjà commencée, sauf disposition légale impérative contraire.
        </p>
        <p>
          {LEGAL_PUBLISHER.companyName} peut résilier ou suspendre l&apos;abonnement en cas de manquement grave
          aux CGV ou CGU, d&apos;impayé ou d&apos;usage frauduleux, après notification lorsque cela est possible.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">5. Paiement et facturation</h2>
        <p>
          Les paiements sont traités par le prestataire Stripe (carte bancaire ou moyen de paiement accepté). Le
          prélèvement intervient au début de chaque période d&apos;abonnement, ou à la fin de l&apos;essai gratuit
          le cas échéant.
        </p>
        <p>
          Des factures sont émises conformément à la réglementation française et mises à disposition dans
          l&apos;espace artisan. En cas de défaut de paiement, l&apos;accès au service peut être suspendu après
          relance.
        </p>
        <p>
          Les achats ponctuels (packs de minutes, surcoûts d&apos;affranchissement acceptés, etc.) sont facturés
          au moment de la commande ou de l&apos;exécution du service concerné.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">6. Recouvrement de créances</h2>
        <p>
          La transmission d&apos;un dossier de créance à notre partenaire de recouvrement est subordonnée à
          l&apos;acceptation expresse, par l&apos;artisan, d&apos;un mandat de recouvrement amiable et judiciaire.
          La rémunération du partenaire est prélevée sur les sommes effectivement recouvrées : aucun frais
          n&apos;est dû en l&apos;absence de recouvrement.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">7. Modification des tarifs</h2>
        <p>
          {LEGAL_PUBLISHER.companyName} se réserve le droit de modifier ses tarifs. Toute modification sera
          notifiée à l&apos;artisan avant son application. En cas de désaccord, l&apos;artisan peut résilier son
          abonnement avant l&apos;entrée en vigueur des nouveaux tarifs.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">8. Droit de rétractation</h2>
        <p>
          L&apos;abonnement {LEGAL_PUBLISHER.productName} est destiné aux professionnels. Le droit de rétractation
          prévu pour les consommateurs (articles L.221-18 et suivants du Code de la consommation) ne s&apos;applique
          pas aux contrats conclus entre professionnels, sous réserve des dispositions d&apos;ordre public
          applicables.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">9. Responsabilité</h2>
        <p>
          {LEGAL_PUBLISHER.productName} est un outil de gestion mis à disposition en mode SaaS.{" "}
          {LEGAL_PUBLISHER.companyName} ne saurait être tenue responsable des relations contractuelles entre
          l&apos;artisan et ses propres clients, ni du contenu des devis, factures ou documents émis par
          l&apos;artisan via la plateforme.
        </p>
        <p>
          La responsabilité de {LEGAL_PUBLISHER.companyName}, toutes causes confondues, est limitée au montant
          des sommes effectivement payées par l&apos;artisan au titre des douze (12) derniers mois
          d&apos;abonnement.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">10. Données personnelles</h2>
        <p>
          Le traitement des données personnelles est décrit dans la{" "}
          <Link href="/confidentialite" className="text-orange-600 underline-offset-2 hover:underline">
            Politique de confidentialité
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">11. Litiges et droit applicable</h2>
        <p>
          Les présentes CGV sont soumises au droit français. En cas de différend, l&apos;artisan est invité à
          contacter{" "}
          <a href={`mailto:${LEGAL_PUBLISHER.email}`} className="text-orange-600 underline-offset-2 hover:underline">
            {LEGAL_PUBLISHER.email}
          </a>{" "}
          afin de rechercher une solution amiable.
        </p>
        <p>
          À défaut, les tribunaux du ressort du siège social de l&apos;éditeur seront compétents, sous réserve
          des règles d&apos;ordre public.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">12. Contact</h2>
        <p>
          Pour toute question relative aux présentes CGV :{" "}
          <a href={`mailto:${LEGAL_PUBLISHER.email}`} className="text-orange-600 underline-offset-2 hover:underline">
            {LEGAL_PUBLISHER.email}
          </a>
        </p>
      </section>
    </LegalPageShell>
  );
}
