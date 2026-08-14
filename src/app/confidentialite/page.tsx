import type { Metadata } from "next";

import { LegalPageShell } from "@/components/legal/legal-page-shell";
import { LEGAL_PUBLISHER, LEGAL_SUBPROCESSORS } from "@/lib/legal/site-legal-info";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: `Politique de confidentialité et protection des données du service ${LEGAL_PUBLISHER.productName}.`,
};

export default function ConfidentialitePage() {
  return (
    <LegalPageShell title="Politique de confidentialité">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">1. Responsable du traitement</h2>
        <p>
          Le responsable du traitement des données personnelles collectées via {LEGAL_PUBLISHER.publicDomain}{" "}
          et {LEGAL_PUBLISHER.appDomain} est :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>{LEGAL_PUBLISHER.companyName}</strong> — {LEGAL_PUBLISHER.legalForm}
          </li>
          <li>{LEGAL_PUBLISHER.address}</li>
          <li>SIREN : {LEGAL_PUBLISHER.siren}</li>
          <li>SIRET : {LEGAL_PUBLISHER.siret}</li>
          <li>
            Contact données personnelles / DPO :{" "}
            <a href={`mailto:${LEGAL_PUBLISHER.privacyEmail}`} className="text-orange-600 underline-offset-2 hover:underline">
              {LEGAL_PUBLISHER.privacyEmail}
            </a>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">2. Données collectées</h2>
        <p>Selon votre usage de {LEGAL_PUBLISHER.productName}, nous pouvons traiter :</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Compte artisan</strong> : identité, e-mail, téléphone, nom commercial, adresse
            professionnelle, identifiants légaux (SIRET, TVA le cas échéant), paramètres métier, données de
            facturation.
          </li>
          <li>
            <strong>Compte client</strong> : identité, e-mail, téléphone, historique de devis, factures et
            messages avec un artisan.
          </li>
          <li>
            <strong>Leads / tunnel d&apos;estimation</strong> : description du projet, localisation,
            coordonnées, photos ou vidéos transmises, échanges de qualification.
          </li>
          <li>
            <strong>Données d&apos;activité</strong> : devis, factures, rendez-vous, messages, journaux
            techniques limités à la sécurité et au bon fonctionnement du service.
          </li>
          <li>
            <strong>Secrétariat vocal (option)</strong> : enregistrements ou transcriptions d&apos;appels,
            métadonnées d&apos;appel, contenus nécessaires à la prise de rendez-vous via ElevenLabs.
          </li>
          <li>
            <strong>Données techniques</strong> : adresse IP, logs de connexion, cookies de session
            strictement nécessaires à l&apos;authentification.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">3. Finalités et bases légales</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-2 pr-4 font-semibold text-slate-900">Finalité</th>
                <th className="py-2 font-semibold text-slate-900">Base légale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-2 pr-4">Création et gestion du compte</td>
                <td className="py-2">Exécution du contrat</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Fourniture du service (devis, factures, RDV, messagerie)</td>
                <td className="py-2">Exécution du contrat</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Qualification IA et assistant métier</td>
                <td className="py-2">Exécution du contrat / intérêt légitime</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Secrétariat vocal IA</td>
                <td className="py-2">Exécution du contrat / consentement le cas échéant</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Paiements et facturation de l&apos;abonnement</td>
                <td className="py-2">Exécution du contrat / obligation légale</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Support, sécurité, prévention de la fraude</td>
                <td className="py-2">Intérêt légitime</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Prospects via tunnel public ou widget</td>
                <td className="py-2">Intérêt légitime / mesures précontractuelles</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">4. Sous-traitants</h2>
        <p>
          Nous faisons appel aux prestataires suivants, agissant pour notre compte et selon nos instructions :
        </p>
        <ul className="list-disc space-y-2 pl-5">
          {LEGAL_SUBPROCESSORS.map((item) => (
            <li key={item.name}>
              <strong>{item.name}</strong> — {item.role}.{" "}
              <a href={item.website} className="text-orange-600 underline-offset-2 hover:underline" rel="noopener noreferrer" target="_blank">
                {item.website.replace("https://", "")}
              </a>
            </li>
          ))}
        </ul>
        <p>
          Les données applicatives sont hébergées via <strong>Supabase</strong> dans l&apos;Union européenne.
          Certains sous-traitants (notamment Mistral AI, ElevenLabs ou Stripe) peuvent traiter des données en
          dehors de l&apos;UE ; le cas échéant, des garanties appropriées sont mises en place (clauses
          contractuelles types, mesures de sécurité).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">5. Durées de conservation</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Données de compte : pendant la durée de la relation contractuelle, puis 3 ans à des fins de prospection ou de preuve.</li>
          <li>Données de facturation émises par l&apos;artisan : selon les obligations comptables (10 ans).</li>
          <li>Leads non convertis : 3 ans maximum à compter du dernier contact, sauf suppression anticipée.</li>
          <li>Données liées au secrétariat vocal : durée strictement nécessaire à la prestation, puis suppression ou anonymisation.</li>
          <li>Logs techniques : jusqu&apos;à 12 mois, sauf obligation légale contraire.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">6. Destinataires</h2>
        <p>
          Les données peuvent être accessibles à {LEGAL_PUBLISHER.companyName}, à ses sous-traitants listés
          ci-dessus, et — lorsque l&apos;utilisateur interagit avec un artisan — à l&apos;artisan concerné qui
          agit alors, le cas échéant, en responsable de traitement distinct pour la relation commerciale avec
          son client.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">7. Vos droits</h2>
        <p>Conformément au RGPD, vous disposez des droits suivants :</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>droit d&apos;accès, de rectification et d&apos;effacement ;</li>
          <li>droit à la limitation et à l&apos;opposition, dans les conditions prévues par la loi ;</li>
          <li>droit à la portabilité des données que vous avez fournies ;</li>
          <li>droit de retirer votre consentement à tout moment lorsque le traitement repose sur celui-ci ;</li>
          <li>droit d&apos;introduire une réclamation auprès de la CNIL (www.cnil.fr).</li>
        </ul>
        <p>
          Pour exercer vos droits :{" "}
          <a href={`mailto:${LEGAL_PUBLISHER.privacyEmail}`} className="text-orange-600 underline-offset-2 hover:underline">
            {LEGAL_PUBLISHER.privacyEmail}
          </a>
          . Une pièce d&apos;identité pourra être demandée en cas de doute raisonnable sur votre identité.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">8. Cookies</h2>
        <p>
          {LEGAL_PUBLISHER.productName} utilise principalement des cookies et traceurs strictement nécessaires
          au fonctionnement du service (session d&apos;authentification, préférences essentielles). Nous
          n&apos;utilisons pas de cookies publicitaires tiers par défaut. Tout cookie analytique facultatif
          fera l&apos;objet d&apos;un recueil de consentement préalable le cas échéant.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">9. Sécurité</h2>
        <p>
          Nous mettons en œuvre des mesures techniques et organisationnelles appropriées (chiffrement en
          transit, contrôle d&apos;accès, hébergement sécurisé) pour protéger vos données contre la perte,
          l&apos;accès non autorisé ou la divulgation.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">10. Modifications</h2>
        <p>
          La présente politique peut être mise à jour. La date de dernière révision est indiquée en haut de
          page. Nous vous informerons de toute modification substantielle par e-mail ou via l&apos;application
          lorsque cela est requis.
        </p>
      </section>
    </LegalPageShell>
  );
}
