import type { Metadata } from "next";
import Link from "next/link";

import { LegalPageShell } from "@/components/legal/legal-page-shell";
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
          <strong>{LEGAL_PUBLISHER.legalName}</strong>, exerçant sous le nom commercial{" "}
          <strong>{LEGAL_PUBLISHER.companyName}</strong> ({LEGAL_PUBLISHER.legalForm}), {LEGAL_PUBLISHER.address}{" "}
          (SIRET : {LEGAL_PUBLISHER.siret}).
        </p>
        <p>
          {LEGAL_PUBLISHER.productName} est une plateforme SaaS destinée aux artisans du bâtiment pour la
          gestion de leur activité (devis, factures, rendez-vous, messagerie, site vitrine) et, dans les
          formules Pro et Premium, une secrétaire vocale fonctionnant par intelligence artificielle (« Soline »). Des espaces clients permettent aux
          particuliers de suivre leurs échanges, devis et factures avec leur artisan.
        </p>
        <p>
          L&apos;inscription ou l&apos;utilisation du service vaut acceptation pleine et entière des
          présentes CGU et des{" "}
          <Link href="/cgv" className="text-orange-600 underline-offset-2 hover:underline">
            Conditions générales de vente (CGV)
          </Link>
          .
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
        <h2 className="text-lg font-semibold text-slate-900">3. Abonnement et tarification</h2>
        <p>
          L&apos;accès aux fonctionnalités payantes de {LEGAL_PUBLISHER.productName} est subordonné à la
          souscription d&apos;un abonnement. Les offres, tarifs, modalités de paiement, durée, renouvellement
          et résiliation sont détaillés dans les{" "}
          <Link href="/cgv" className="text-orange-600 underline-offset-2 hover:underline">
            Conditions générales de vente (CGV)
          </Link>
          .
        </p>
        <p>
          Un essai gratuit de la formule Base peut être proposé lors de l&apos;inscription, sans carte bancaire, pour une durée
          limitée et selon les conditions affichées au moment de la création du compte.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">4. Fonctionnalités d&apos;intelligence artificielle</h2>
        <p>
          {LEGAL_PUBLISHER.productName} intègre des fonctionnalités assistées par intelligence artificielle
          (qualification de demandes, suggestions de devis, estimation de prix de matériaux, assistant interne,
          secrétaire vocale).
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
            <strong>Transparence.</strong> Conformément à l&apos;article 50 du règlement (UE) 2024/1689 sur
            l&apos;intelligence artificielle, la secrétaire Soline indique à chaque correspondant, dès le début
            de l&apos;appel, qu&apos;il s&apos;adresse à une assistante virtuelle. L&apos;artisan ne doit pas
            modifier ce message ni présenter l&apos;agent comme une personne humaine.
          </li>
          <li>
            La secrétaire Soline traite des communications téléphoniques (transcription, synthèse, prise de
            rendez-vous). L&apos;artisan informe ses clients de ce traitement (par exemple dans ses mentions
            d&apos;information ou sur son site), s&apos;assure d&apos;être titulaire de la ligne ou habilité à
            mettre en place le renvoi d&apos;appel, et valide les rendez-vous et devis préparés avant tout
            engagement envers le client.
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
          d&apos;exploitation ou préjudices commerciaux. Sauf faute lourde ou dolosive, la responsabilité de
          l&apos;éditeur, toutes causes confondues, est limitée au montant des sommes effectivement payées par l&apos;utilisateur au titre
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
        <h2 className="text-lg font-semibold text-slate-900">10. Sous-traitance des données personnelles (article 28 RGPD)</h2>
        <p>
          Pour les données personnelles que l&apos;artisan enregistre ou reçoit dans son espace (clients et
          prospects, devis, factures, messages, appels reçus par la secrétaire Soline), l&apos;artisan est
          responsable de traitement et {LEGAL_PUBLISHER.companyName} agit en qualité de sous-traitant. Le
          présent article constitue le contrat de sous-traitance prévu à l&apos;article 28 du RGPD.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Objet, durée, finalité</strong> : fourniture du service {LEGAL_PUBLISHER.productName}{" "}
            (gestion commerciale, facturation, prise d&apos;appels et de rendez-vous), pendant la durée du
            contrat.
          </li>
          <li>
            <strong>Données et personnes concernées</strong> : identité, coordonnées, adresse du chantier,
            description des travaux, photos transmises, contenu des appels et messages, données de facturation
            des clients et prospects de l&apos;artisan.
          </li>
          <li>
            <strong>Instructions</strong> : {LEGAL_PUBLISHER.companyName} ne traite ces données que sur
            instruction documentée de l&apos;artisan, constituée par les présentes et par l&apos;usage du
            service, et l&apos;informe si une instruction lui paraît contraire à la réglementation.
          </li>
          <li>
            <strong>Confidentialité et sécurité</strong> : accès limité aux personnes habilitées soumises à
            confidentialité ; isolation des données entre comptes, chiffrement des échanges, sauvegardes et
            mesures prévues à l&apos;article 32 du RGPD.
          </li>
          <li>
            <strong>Sous-traitants ultérieurs</strong> : l&apos;artisan autorise le recours aux prestataires
            listés dans la{" "}
            <a href="/confidentialite" className="text-orange-600 underline-offset-2 hover:underline">
              Politique de confidentialité
            </a>
            , liés par des obligations équivalentes. Tout ajout ou remplacement est notifié au moins trente
            (30) jours à l&apos;avance ; l&apos;artisan peut s&apos;y opposer en résiliant sans frais.
          </li>
          <li>
            <strong>Transferts hors UE</strong> : encadrés par une décision d&apos;adéquation ou des clauses
            contractuelles types.
          </li>
          <li>
            <strong>Assistance</strong> : {LEGAL_PUBLISHER.companyName} aide l&apos;artisan à répondre aux
            demandes d&apos;exercice des droits, et lui notifie toute violation de données le concernant dans
            les meilleurs délais et au plus tard quarante-huit (48) heures après en avoir pris connaissance.
          </li>
          <li>
            <strong>Fin du contrat</strong> : restitution des données sur demande puis suppression dans les
            conditions de l&apos;article 12 des CGV, sauf obligation légale de conservation.
          </li>
          <li>
            <strong>Contrôle</strong> : {LEGAL_PUBLISHER.companyName} met à disposition la documentation
            nécessaire pour démontrer le respect de ces obligations.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">11. Données personnelles</h2>
        <p>
          Le traitement des données personnelles est décrit dans la{" "}
          <a href="/confidentialite" className="text-orange-600 underline-offset-2 hover:underline">
            Politique de confidentialité
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">12. Litiges et droit applicable</h2>
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
          Pour les litiges entre professionnels, la clause de compétence de l&apos;article 15 des CGV
          s&apos;applique. Les utilisateurs consommateurs conservent le bénéfice des règles de compétence
          d&apos;ordre public qui les protègent.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">13. Contact</h2>
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
