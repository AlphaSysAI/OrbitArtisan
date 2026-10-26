import type { Metadata } from "next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { frenchVatFromSiren } from "@/lib/onboarding/identifiers";
import { lookupCompanyBySiren } from "@/lib/onboarding/company-registry";
import { loadReferrerInvitation } from "@/lib/referrers/invitations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

import { ReferrerOnboardingForm } from "./referrer-onboarding-form";

export const metadata: Metadata = { title: "Accès apporteur d’affaires — Soline", robots: { index: false } };

const CLOSED_TEXT = {
  invalid: { title: "Lien invalide", body: "Ce lien n’est pas reconnu. Demande un nouveau lien à l’équipe Soline." },
  expired: { title: "Lien expiré", body: "Ce lien a dépassé ses 14 jours de validité. Demande un nouveau lien à l’équipe Soline." },
  claimed: { title: "Accès déjà créé", body: "Ce lien a déjà servi. Connecte-toi avec ton e-mail et ton mot de passe." },
  cancelled: { title: "Invitation annulée", body: "Cette invitation a été annulée. Contacte l’équipe Soline." },
} as const;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="mb-8 space-y-2 text-center">
          <p className="text-sm text-muted-foreground">Soline</p>
          <h1 className="text-2xl font-semibold tracking-tight">Créer ton accès apporteur d’affaires</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Lien reçu par e-mail : l’ouverture ne modifie rien (les antivirus de messagerie pré-visitent les liens). */
export default async function ReferrerInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createSupabaseServiceRoleClient();
  if (!db) {
    return (
      <Shell>
        <Alert variant="destructive">
          <AlertTitle>Service indisponible</AlertTitle>
          <AlertDescription>Réessaie dans quelques minutes.</AlertDescription>
        </Alert>
      </Shell>
    );
  }

  const link = await loadReferrerInvitation(db, token);
  if (!link.ok) {
    const t = CLOSED_TEXT[link.reason];
    return (
      <Shell>
        <Alert variant={link.reason === "claimed" ? "default" : "destructive"}>
          <AlertTitle>{t.title}</AlertTitle>
          <AlertDescription>
            {t.body}
            {link.reason === "claimed" ? (
              <>
                {" "}
                <a href="/login?next=%2Fapporteur" className="font-medium underline underline-offset-4">
                  Se connecter
                </a>
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      </Shell>
    );
  }

  const inv = link.invitation;
  const [company, session] = await Promise.all([
    lookupCompanyBySiren(inv.siren),
    createSupabaseServerClient().then((s) => s.auth.getUser()),
  ]);
  const signedInEmail = session.data.user?.email ?? null;

  return (
    <Shell>
      <div className="space-y-6">
        {signedInEmail ? (
          <Alert>
            <AlertTitle>Tu es connecté avec {signedInEmail}</AlertTitle>
            <AlertDescription>Créer cet accès te connectera à ton nouvel espace apporteur à la place.</AlertDescription>
          </Alert>
        ) : null}
        {company && !company.active ? (
          <Alert variant="destructive">
            <AlertTitle>Entreprise indiquée comme fermée</AlertTitle>
            <AlertDescription>
              L’Annuaire des entreprises indique ce SIREN comme cessé. Si c’est une erreur, contacte l’équipe Soline avant de continuer.
            </AlertDescription>
          </Alert>
        ) : null}
        <ReferrerOnboardingForm
          token={token}
          prefill={{
            email: inv.email,
            firstName: inv.first_name,
            lastName: inv.last_name,
            siren: inv.siren,
            businessName: company?.name ?? "",
            siret: company?.siret ?? "",
            addressLine1: company?.addressLine1 ?? "",
            postalCode: company?.postalCode ?? "",
            city: company?.city ?? "",
            suggestedVatNumber: frenchVatFromSiren(inv.siren) ?? "",
          }}
        />
      </div>
    </Shell>
  );
}
