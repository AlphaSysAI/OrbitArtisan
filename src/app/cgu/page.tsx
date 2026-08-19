import type { Metadata } from "next";

import { LegalPageShell } from "@/components/legal/legal-page-shell";
import {
  formatPriceHtEur,
  SOLINE_RECHARGE_PACKS,
  SUBSCRIPTION_PLANS,
} from "@/lib/billing/subscription-plans";
import { LEGAL_PUBLISHER } from "@/lib/legal/site-legal-info";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation",
  description: `Conditions générales d'utilisation du service ${LEGAL_PUBLISHER.productName}.`,
};

export default function CguPage() {
  return (
    <LegalPageShell title="Conditions générales d'utilisation (CGU)">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">1. Objet</h2>
        <p>
          Les présentes Conditions Générales d&apos;Utilisation (ci-après « CGU ») régissent l&apos;accès et
          l&apos;utilisation du service <strong>{LEGAL_PUBLISHER.productName}</strong>, accessible via{" "}
          {LEGAL_PUBLISHER.publicDomain} et {LEGAL_PUBLISHER.appDomain}, édité par{" "}
          <strong>{LEGAL_PUBLISHER.companyName}</strong> ({LEGAL_PUBLISHER.legalForm}), {LEGAL_PUBLISHER.address}
          (SIRET : {LEGAL_PUBLISHER.siret}).
        </p>
        <p>
          {LEGAL_PUBLISHER.productName} est une plateforme SaaS destinée aux artisans du bâtiment pour la
          gestion de leur activité (devis, factures, rendez-vous, messagerie, site vitrine) et, en option,
          l&apos;activation d&apos;un secrétariat vocal intelligent. Des espaces clients permettent aux
          particuliers de suivre leurs échanges, devis et factures avec leur artisan.
        </p>
        <p>
          L&apos;inscription ou l&apos;utilisation du service vaut acceptation pleine et entière des
          présentes CGU.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">2. Comptes et accès</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Compte artisan</strong> : réservé aux professionnels du bâtiment. L&apos;utilisateur
            s&apos;engage à fournir des informations exactes (identité, coordonnées, statut juridique le cas
            échéant).
          </li>
          <li>
            <strong>Compte client</strong> : permet à un particulier ou à un professionnel d&apos;accéder aux
            documents et échanges liés à un artisan.
          </li>
          <li>
            L&apos;utilisateur est responsable de la confidentialité de ses identifiants et de toute activité
            réalisée depuis son compte.
          </li>
          <li>
            {LEGAL_PUBLISHER.companyName} se réserve le droit de suspendre ou supprimer un compte en cas de
            violation des CGU, de fraude ou d&apos;usage abusif.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">3. Offres et tarification</h2>
        <p>Les offres en vigueur au moment de la souscription sont les suivantes :</p>
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
            <strong>Essai gratuit</strong> : 15 jours sans carte bancaire, sous réserve des conditions
            affichées lors de l&apos;inscription.
          </li>
        </ul>
        <p>Des packs de recharge de minutes Soline sont également disponibles à l&apos;achat depuis l&apos;espace artisan :</p>
        <ul className="list-disc space-y-2 pl-5">
          {SOLINE_RECHARGE_PACKS.map((pack) => (
            <li key={pack.id}>
              <strong>{pack.label}</strong> : {pack.priceHtEur} € HT — {pack.minutes} minutes d&apos;appels
              créditées sur le compte.
            </li>
          ))}
        </ul>
        <p>
          Les tarifs peuvent être modifiés. Toute modification sera notifiée à l&apos;utilisateur avant son
          application.           L&apos;abonnement est conclu pour une durée mensuelle ou annuelle selon l&apos;offre choisie,
          renouvelable tacitement, et résiliable à tout moment depuis l&apos;espace utilisateur ou par e-mail à{" "}
          <a href={`mailto:${LEGAL_PUBLISHER.email}`} className="text-orange-600 underline-offset-2 hover:underline">
            {LEGAL_PUBLISHER.email}
          </a>
          .
        </p>
        <p>Les paiements sont traités par le prestataire Stripe. Les factures sont émises conformément à la réglementation française.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">4. Fonctionnalités d&apos;intelligence artificielle</h2>
        <p>
          {LEGAL_PUBLISHER.productName} intègre des fonctionnalités assistées par intelligence artificielle
          (qualification de demandes, suggestions de devis, assistant interne, secrétariat vocal via
          ElevenLabs).
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Les contenus générés (textes, estimations, brouillons de devis, réponses téléphoniques) sont
            fournis à titre d&apos;assistance. L&apos;artisan reste seul responsable de la validation, de
            l&apos;envoi et de la conformité de ses devis, factures et engagements auprès de ses clients.
          </li>
          <li>
            Les estimations issues du tunnel public ou du widget embarqué sont indicatives et non
            contractuelles tant qu&apos;un devis formalisé n&apos;a pas été émis par l&apos;artisan.
          </li>
          <li>
            L&apos;option Soline (secrétariat vocal IA) implique le traitement de communications téléphoniques. L&apos;artisan
            doit informer ses interlocuteurs conformément à la réglementation applicable et s&apos;assurer
            d&apos;être habilité à mettre en place le renvoi d&apos;appel.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">5. Obligations de l&apos;utilisateur</h2>
        <p>L&apos;utilisateur s&apos;engage à :</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>utiliser le service conformément à sa destination professionnelle et à la loi ;</li>
          <li>ne pas porter atteinte aux droits de tiers ni diffuser de contenus illicites ;</li>
          <li>ne pas tenter d&apos;accéder de manière non autorisée aux systèmes ou données ;</li>
          <li>respecter la confidentialité des données de ses clients et obtenir les consentements requis.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">6. Disponibilité et maintenance</h2>
        <p>
          {LEGAL_PUBLISHER.companyName} met en œuvre les moyens raisonnables pour assurer la disponibilité du
          service. Des interruptions peuvent survenir pour maintenance, mise à jour ou cas de force majeure.
          Aucune garantie de disponibilité ininterrompue n&apos;est accordée.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">7. Responsabilité</h2>
        <p>
          {LEGAL_PUBLISHER.companyName} ne saurait être tenue responsable des dommages indirects, pertes
          d&apos;exploitation ou préjudices commerciaux. La responsabilité de l&apos;éditeur, toutes causes
          confondues, est limitée au montant des sommes effectivement payées par l&apos;utilisateur au titre
          des douze (12) derniers mois d&apos;abonnement.
        </p>
        <p>
          L&apos;artisan demeure seul responsable des relations contractuelles avec ses clients, du contenu
          qu&apos;il publie sur sa vitrine et des documents qu&apos;il émet via la plateforme.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">8. Propriété intellectuelle</h2>
        <p>
          Le service, son code, sa marque et ses interfaces restent la propriété de {LEGAL_PUBLISHER.companyName}.
          L&apos;utilisateur conserve la propriété de ses données et contenus. Il accorde à l&apos;éditeur une
          licence limitée d&apos;hébergement et de traitement de ces données aux seules fins d&apos;exécution
          du service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">9. Résiliation</h2>
        <p>
          L&apos;utilisateur peut résilier son abonnement à tout moment. En cas de résiliation, l&apos;accès
          au service prend fin à l&apos;issue de la période en cours. {LEGAL_PUBLISHER.companyName} peut
          résilier un compte en cas de manquement grave, après notification lorsque cela est possible.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">10. Données personnelles</h2>
        <p>
          Le traitement des données personnelles est décrit dans la{" "}
          <a href="/confidentialite" className="text-orange-600 underline-offset-2 hover:underline">
            Politique de confidentialité
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">11. Litiges et droit applicable</h2>
        <p>
          Les présentes CGU sont soumises au droit français. En cas de différend, l&apos;utilisateur est invité
          à contacter {LEGAL_PUBLISHER.email} afin de rechercher une solution amiable.
        </p>
        <p>
          À défaut de résolution amiable, et conformément aux dispositions du Code de la consommation, le
          consommateur peut recourir gratuitement à un médiateur de la consommation. Les coordonnées du
          médiateur compétent seront communiquées sur demande à {LEGAL_PUBLISHER.email}.
        </p>
        <p>
          À défaut, les tribunaux du ressort du siège social de l&apos;éditeur seront compétents, sous réserve
          des règles d&apos;ordre public applicables aux consommateurs.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">12. Contact</h2>
        <p>
          Pour toute question relative aux présentes CGU :{" "}
          <a href={`mailto:${LEGAL_PUBLISHER.email}`} className="text-orange-600 underline-offset-2 hover:underline">
            {LEGAL_PUBLISHER.email}
          </a>
        </p>
      </section>
    </LegalPageShell>
  );
}
