import type { Metadata } from "next";
import Link from "next/link";

import { LegalPageShell } from "@/components/legal/legal-page-shell";
import { AMBASSADOR_PROGRAM } from "@/lib/billing/promo-program";
import { TRIAL_DURATION_DAYS } from "@/lib/billing/subscription-access";
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

const linkClass = "text-orange-600 underline-offset-2 hover:underline";
const h2Class = "text-lg font-semibold text-slate-900";

function Mail() {
  return (
    <a href={`mailto:${LEGAL_PUBLISHER.email}`} className={linkClass}>
      {LEGAL_PUBLISHER.email}
    </a>
  );
}

export default function CgvPage() {
  const eligiblePlanNames = SUBSCRIPTION_PLANS.filter((plan) =>
    AMBASSADOR_PROGRAM.eligiblePlans.includes(plan.id),
  )
    .map((plan) => plan.name)
    .join(" et ");

  return (
    <LegalPageShell title="Conditions générales de vente (CGV)">
      <section className="space-y-3">
        <h2 className={h2Class}>1. Objet et champ d&apos;application</h2>
        <p>
          Les présentes Conditions générales de vente (ci-après « CGV ») régissent la souscription et la
          fourniture de l&apos;abonnement au service <strong>{LEGAL_PUBLISHER.productName}</strong>, édité par{" "}
          <strong>{LEGAL_PUBLISHER.legalName}</strong>, exerçant sous le nom commercial{" "}
          <strong>{LEGAL_PUBLISHER.companyName}</strong> ({LEGAL_PUBLISHER.legalForm}),{" "}
          {LEGAL_PUBLISHER.address}, SIREN {LEGAL_PUBLISHER.siren} (ci-après « l&apos;Éditeur »).
        </p>
        <p>
          Le service est réservé aux professionnels du bâtiment (ci-après « l&apos;Artisan ») qui le
          souscrivent pour les besoins de leur activité professionnelle. L&apos;utilisation du service est en
          outre soumise aux{" "}
          <Link href="/cgu" className={linkClass}>
            Conditions générales d&apos;utilisation (CGU)
          </Link>
          . En cas de contradiction, les CGV prévalent pour les aspects commerciaux et tarifaires.
        </p>
        <p>
          La création d&apos;un compte et toute souscription valent acceptation des CGV et des CGU dans leur
          version en vigueur à cette date, dont l&apos;Artisan conserve la trace (date et version acceptées).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={h2Class}>2. Offres et tarifs</h2>
        <p>Les formules d&apos;abonnement sont les suivantes :</p>
        <ul className="list-disc space-y-2 pl-5">
          {SUBSCRIPTION_PLANS.map((plan) => (
            <li key={plan.id}>
              <strong>Formule {plan.name}</strong> — {formatPriceHtEur(plan.priceMonthlyHtEur)} € HT par mois ou{" "}
              {formatPriceHtEur(plan.priceAnnualHtEur)} € HT par an :{" "}
              {plan.solineMinutesIncluded > 0
                ? `logiciel de gestion complet et secrétaire vocale Soline (${plan.solineMinutesIncluded} minutes d'appels incluses par mois civil, non reportables).`
                : "logiciel de gestion complet, sans secrétaire vocale Soline."}
            </li>
          ))}
        </ul>
        <p>
          <strong>TVA.</strong> L&apos;Éditeur relève du régime de la franchise en base de TVA : aucune TVA
          n&apos;est facturée ({LEGAL_PUBLISHER.vatMention}). Le prix indiqué HT est donc le prix effectivement
          payé. Si l&apos;Éditeur devient redevable de la TVA, celle-ci sera ajoutée au taux en vigueur, après
          information préalable de l&apos;Artisan dans les conditions de l&apos;article 10.
        </p>
        <p>
          Chaque formule comprend l&apos;envoi de{" "}
          <strong>
            {FORMAL_NOTICES_INCLUDED_PER_MONTH} mise en demeure par lettre recommandée avec accusé de réception
            par mois civil
          </strong>
          , affranchissement inclus, non reportable. Au-delà, les frais d&apos;affranchissement sont refacturés à
          l&apos;Artisan au tarif postal en vigueur, sans marge, et seulement après son acceptation expresse du
          surcoût avant chaque envoi.
        </p>
        <p>Des recharges de minutes Soline peuvent être achetées depuis l&apos;espace artisan :</p>
        <ul className="list-disc space-y-2 pl-5">
          {SOLINE_RECHARGE_PACKS.map((pack) => (
            <li key={pack.id}>
              <strong>{pack.label}</strong> : {pack.priceHtEur} € HT — {pack.minutes} minutes d&apos;appels.
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className={h2Class}>3. Essai gratuit</h2>
        <p>
          Tout nouveau compte artisan bénéficie d&apos;un essai gratuit de {TRIAL_DURATION_DAYS} jours, sans
          carte bancaire, <strong>portant uniquement sur la formule Base</strong>. Les formules Pro et Premium
          (secrétaire vocale Soline incluse) ne font l&apos;objet d&apos;aucune période d&apos;essai : elles sont
          payantes dès leur souscription, qui peut intervenir à tout moment, y compris pendant l&apos;essai.
        </p>
        <p>
          À la fin de l&apos;essai, aucun prélèvement n&apos;est effectué et aucun abonnement n&apos;est souscrit
          automatiquement : la création de nouveaux devis et factures est suspendue jusqu&apos;à la
          souscription d&apos;une formule. Les documents déjà créés restent consultables.
        </p>
      </section>

      <section className="space-y-3" id="tarif-ambassadeur">
        <h2 className={h2Class}>4. Offre promotionnelle « {AMBASSADOR_PROGRAM.label} »</h2>
        <p>
          <strong>Bénéficiaires.</strong> L&apos;offre est réservée aux {AMBASSADOR_PROGRAM.maxSlots} premiers
          artisans qui, après avoir enregistré le code <strong>{AMBASSADOR_PROGRAM.code}</strong> (à
          l&apos;inscription ou depuis Réglages &gt; Abonnement), <strong>souscrivent et paient</strong> un
          abonnement {eligiblePlanNames} au plus tard le{" "}
          <strong>{AMBASSADOR_PROGRAM.endsAtLabel} à 23 h 59 (heure de Paris)</strong>. L&apos;enregistrement du
          code seul ne réserve aucune place. Une place est bloquée pendant trente (30) minutes au lancement du
          paiement ; elle est définitivement attribuée à la confirmation du paiement et libérée si celui-ci
          n&apos;aboutit pas. L&apos;ordre d&apos;attribution enregistré par le système fait foi ; le nombre de
          places restantes affiché dans l&apos;espace artisan l&apos;est à titre indicatif. Si l&apos;offre est
          close au moment du paiement, l&apos;Artisan en est informé avant tout paiement et peut souscrire au
          tarif normal. Une seule place par entreprise (même SIREN).
        </p>
        <p>
          <strong>Avantage.</strong> Remise de <strong>{AMBASSADOR_PROGRAM.discountPercent} %</strong> sur le prix
          HT des formules {eligiblePlanNames}, en paiement mensuel comme annuel, appliquée automatiquement lors
          de la souscription. La remise ne s&apos;applique ni à la formule Base, ni aux recharges de minutes, ni
          aux frais d&apos;affranchissement.
        </p>
        <p>
          <strong>Durée.</strong> La remise est conservée <strong>tant que l&apos;abonnement reste actif sans
          interruption</strong>, y compris en cas de passage de Pro à Premium (ou inversement) et en cas
          d&apos;évolution des tarifs, auquel cas le pourcentage de remise s&apos;applique au nouveau tarif. Elle
          est sans effet pendant une éventuelle période en formule Base et s&apos;applique de nouveau en cas de
          retour à Pro ou Premium au sein du même abonnement.
        </p>
        <p>
          <strong>Perte de l&apos;avantage.</strong> La remise est définitivement perdue en cas de fin de
          l&apos;abonnement, quelle qu&apos;en soit la cause (résiliation par l&apos;Artisan, résiliation pour
          impayé non régularisé). Une nouvelle souscription ultérieure est facturée au tarif en vigueur. La place
          n&apos;est pas réattribuée.
        </p>
        <p>
          L&apos;offre n&apos;est ni cumulable avec une autre offre promotionnelle, ni cessible, ni convertible
          en numéraire. En cas de fraude avérée (comptes multiples, fausse identité professionnelle),
          l&apos;Éditeur peut retirer la remise après en avoir informé l&apos;Artisan.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={h2Class}>5. Souscription et formation du contrat</h2>
        <p>
          La souscription s&apos;effectue en ligne depuis l&apos;espace artisan. Le contrat est formé à la
          validation du paiement sur la page sécurisée du prestataire de paiement ; une confirmation est
          adressée par e-mail. L&apos;Artisan garantit agir pour les besoins de son activité professionnelle,
          disposer du pouvoir d&apos;engager son entreprise et fournir des informations exactes, notamment pour
          l&apos;établissement des factures (dénomination, adresse, SIREN).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={h2Class}>6. Durée, renouvellement et résiliation</h2>
        <p>
          L&apos;abonnement est conclu pour une période d&apos;un mois ou d&apos;un an selon le mode de paiement
          choisi, renouvelée tacitement pour une durée identique.
        </p>
        <p>
          L&apos;Artisan peut résilier à tout moment depuis son espace (portail de paiement) ou par e-mail à{" "}
          <Mail />. La résiliation prend effet à la fin de la période en cours, déjà payée, sans frais ; aucun
          remboursement au prorata n&apos;est dû pour la période commencée.
        </p>
        <p>
          L&apos;Éditeur peut résilier ou suspendre l&apos;abonnement en cas d&apos;impayé (article 8), de
          manquement grave aux CGV ou CGU ou d&apos;usage frauduleux, après mise en demeure restée sans effet
          pendant huit (8) jours, sauf urgence liée à la sécurité du service ou de ses utilisateurs.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={h2Class}>7. Paiement et facturation</h2>
        <p>
          Les paiements sont traités par Stripe. L&apos;abonnement est payable d&apos;avance, au début de chaque
          période mensuelle ou annuelle. Les achats ponctuels (recharges de minutes, affranchissements acceptés)
          sont payables à la commande.
        </p>
        <p>
          Une facture est émise pour chaque paiement et mise à disposition dans l&apos;espace artisan (portail de
          paiement). Elle porte la mention « {LEGAL_PUBLISHER.vatMention} » tant que l&apos;Éditeur bénéficie de
          la franchise en base.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={h2Class}>8. Retard et défaut de paiement</h2>
        <p>
          En cas d&apos;échec de paiement, le prestataire procède à de nouvelles tentatives et l&apos;Artisan en
          est informé. Toute somme non payée à l&apos;échéance porte de plein droit intérêt au taux de trois (3)
          fois le taux d&apos;intérêt légal, et donne lieu à une indemnité forfaitaire pour frais de recouvrement
          de 40 € (articles L. 441-10 et D. 441-5 du Code de commerce).
        </p>
        <p>
          À défaut de régularisation dans les huit (8) jours suivant une mise en demeure (e-mail compris),
          l&apos;accès à la création de nouveaux documents peut être suspendu, puis l&apos;abonnement résilié.
          Les documents déjà émis restent consultables et exportables.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={h2Class}>9. Recouvrement des créances de l&apos;Artisan</h2>
        <p>
          La transmission d&apos;un dossier de créance à un partenaire de recouvrement est subordonnée à
          l&apos;acceptation expresse, par l&apos;Artisan, d&apos;un mandat de recouvrement. La rémunération du
          partenaire est prélevée sur les sommes effectivement recouvrées : aucun frais n&apos;est dû en
          l&apos;absence de recouvrement.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={h2Class}>10. Modification des tarifs et des CGV</h2>
        <p>
          L&apos;Éditeur peut faire évoluer ses tarifs et les présentes CGV. Toute modification est notifiée par
          e-mail au moins trente (30) jours avant son application aux abonnements en cours. L&apos;Artisan qui
          la refuse peut résilier sans frais avant son entrée en vigueur ; à défaut, la modification
          s&apos;applique à compter de la période suivante. Les avantages de l&apos;article 4 sont maintenus dans
          les conditions qui y sont prévues.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={h2Class}>11. Droit de rétractation</h2>
        <p>
          L&apos;abonnement étant conclu entre professionnels, le droit de rétractation prévu pour les
          consommateurs ne s&apos;applique pas, sauf dans le cas prévu à l&apos;article L. 221-3 du Code de la
          consommation : contrat conclu hors établissement (par exemple lors d&apos;une démonstration sur
          chantier), par un professionnel employant cinq salariés au plus, dont l&apos;objet n&apos;entre pas
          dans le champ de son activité principale. L&apos;Artisan concerné dispose alors d&apos;un délai de
          quatorze (14) jours pour se rétracter, par e-mail à <Mail /> ; les sommes versées sont remboursées dans
          les quatorze jours.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={h2Class}>12. Données de l&apos;Artisan et fin du contrat</h2>
        <p>
          L&apos;Artisan reste propriétaire de ses données. Il demeure seul tenu de conserver ses devis et
          factures pendant les durées légales (dix ans pour les pièces comptables) : il lui appartient de les
          exporter avant la fin de son abonnement. À sa demande adressée à <Mail /> dans les trente (30) jours
          suivant la fin du contrat, l&apos;Éditeur lui remet une copie de ses données dans un format
          exploitable. Passé ce délai, les données sont supprimées, sous réserve des obligations légales de
          conservation de l&apos;Éditeur.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={h2Class}>13. Responsabilité</h2>
        <p>
          {LEGAL_PUBLISHER.productName} est un outil de gestion fourni en mode SaaS, avec une obligation de
          moyens. Les contenus produits par les fonctionnalités d&apos;intelligence artificielle (brouillons de
          devis, estimations, messages pris par la secrétaire Soline) sont des propositions que l&apos;Artisan
          vérifie et valide avant tout envoi ; il demeure seul responsable des devis, factures et engagements
          pris envers ses clients.
        </p>
        <p>
          L&apos;Éditeur n&apos;est pas responsable des dommages indirects (perte de chiffre d&apos;affaires, de
          clientèle ou de données non exportées). Sauf faute lourde ou dolosive, sa responsabilité totale est
          limitée aux sommes payées par l&apos;Artisan au titre des douze (12) derniers mois d&apos;abonnement.
        </p>
        <p>
          Aucune partie n&apos;est responsable d&apos;un manquement résultant d&apos;un cas de force majeure au
          sens de l&apos;article 1218 du Code civil, y compris la défaillance générale d&apos;un opérateur de
          télécommunications ou d&apos;hébergement.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={h2Class}>14. Données personnelles</h2>
        <p>
          Les traitements réalisés par l&apos;Éditeur sont décrits dans la{" "}
          <Link href="/confidentialite" className={linkClass}>
            Politique de confidentialité
          </Link>
          . Pour les données des clients de l&apos;Artisan, l&apos;Éditeur agit en sous-traitant dans les
          conditions de l&apos;article 28 du RGPD, précisées à l&apos;article 10 des{" "}
          <Link href="/cgu" className={linkClass}>
            CGU
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={h2Class}>15. Droit applicable et litiges</h2>
        <p>
          Les CGV sont soumises au droit français. En cas de différend, les parties recherchent d&apos;abord une
          solution amiable (contact : <Mail />).
        </p>
        <p>
          À défaut d&apos;accord dans un délai de trente (30) jours, et lorsque l&apos;Artisan a la qualité de
          commerçant, le litige relève de la compétence exclusive du tribunal de commerce de Carcassonne
          (article 48 du Code de procédure civile). Dans les autres cas, les règles de compétence de droit commun
          s&apos;appliquent.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={h2Class}>16. Contact</h2>
        <p>
          Pour toute question relative aux présentes CGV : <Mail />.
        </p>
      </section>
    </LegalPageShell>
  );
}
