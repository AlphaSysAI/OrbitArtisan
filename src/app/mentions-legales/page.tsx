import type { Metadata } from "next";

import { LegalPageShell } from "@/components/legal/legal-page-shell";
import { LEGAL_HOST, LEGAL_PUBLISHER } from "@/lib/legal/site-legal-info";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: `Mentions légales du site ${LEGAL_PUBLISHER.publicDomain} et du service ${LEGAL_PUBLISHER.productName}.`,
};

export default function MentionsLegalesPage() {
  return (
    <LegalPageShell title="Mentions légales">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">1. Éditeur du site</h2>
        <p>
          Le site <strong>{LEGAL_PUBLISHER.publicDomain}</strong> et l&apos;application{" "}
          <strong>{LEGAL_PUBLISHER.appDomain}</strong>, édités sous la marque{" "}
          <strong>{LEGAL_PUBLISHER.productName}</strong>, sont exploités par :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>{LEGAL_PUBLISHER.companyName}</strong> — {LEGAL_PUBLISHER.legalForm}
          </li>
          <li>Siège social : {LEGAL_PUBLISHER.address}</li>
          <li>SIREN : {LEGAL_PUBLISHER.siren}</li>
          <li>SIRET : {LEGAL_PUBLISHER.siret}</li>
          <li>
            Directeur de la publication : {LEGAL_PUBLISHER.director}
          </li>
          <li>
            Contact :{" "}
            <a href={`mailto:${LEGAL_PUBLISHER.email}`} className="text-orange-600 underline-offset-2 hover:underline">
              {LEGAL_PUBLISHER.email}
            </a>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">2. Hébergement</h2>
        <p>Le site et l&apos;application sont hébergés par :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>{LEGAL_HOST.name}</strong>
          </li>
          <li>{LEGAL_HOST.address}</li>
          <li>SIRET : {LEGAL_HOST.siret}</li>
          <li>
            Site web :{" "}
            <a href={LEGAL_HOST.website} className="text-orange-600 underline-offset-2 hover:underline" rel="noopener noreferrer" target="_blank">
              {LEGAL_HOST.website}
            </a>
          </li>
        </ul>
        <p>
          Les données applicatives (comptes, devis, factures, messages) sont stockées via{" "}
          <strong>Supabase</strong>, avec des centres de données situés dans l&apos;Union européenne.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">3. Activité</h2>
        <p>
          {LEGAL_PUBLISHER.productName} est un service SaaS de gestion et de secrétariat assisté par
          intelligence artificielle à destination des artisans du bâtiment et de leurs clients (particuliers
          ou professionnels).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">4. Propriété intellectuelle</h2>
        <p>
          L&apos;ensemble des éléments composant le site et l&apos;application (textes, graphismes, logos,
          icônes, logiciels, bases de données) est protégé par le droit de la propriété intellectuelle.
          Toute reproduction, représentation ou exploitation non autorisée est interdite.
        </p>
        <p>
          La marque <strong>{LEGAL_PUBLISHER.productName}</strong> et les contenus éditoriaux publiés par
          l&apos;éditeur ne peuvent être utilisés sans autorisation écrite préalable.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">5. Limitation de responsabilité</h2>
        <p>
          L&apos;éditeur s&apos;efforce d&apos;assurer l&apos;exactitude des informations diffusées sur le
          site. Toutefois, il ne saurait garantir l&apos;absence d&apos;erreurs ou d&apos;interruptions de
          service. L&apos;utilisation du site se fait sous la responsabilité de l&apos;utilisateur.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">6. Données personnelles</h2>
        <p>
          Pour toute information relative au traitement de vos données personnelles, consultez notre{" "}
          <a href="/confidentialite" className="text-orange-600 underline-offset-2 hover:underline">
            Politique de confidentialité
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">7. Droit applicable</h2>
        <p>
          Les présentes mentions légales sont soumises au droit français. En cas de litige, et à défaut de
          résolution amiable, les tribunaux français seront seuls compétents.
        </p>
      </section>
    </LegalPageShell>
  );
}
