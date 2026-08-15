import Link from "next/link";
import { CheckCircle2, MessageSquare, UserPlus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import type { LeadSignupOffer } from "@/lib/leads/client-signup-types";
import { buildLeadLoginHref, buildLeadSignupHref } from "@/lib/leads/client-signup-urls";
import { getMarketingHomeHref } from "@/lib/site-url";
import { cn } from "@/lib/utils";

export function LeadSentPanel({
  leadToken,
  signup,
  warning,
  compact = false,
}: {
  leadToken: string;
  signup?: LeadSignupOffer | null;
  warning?: "no_artisans" | "dispatch_pending";
  compact?: boolean;
}) {
  const canTrackOnline = signup?.canSignup && signup.email;
  const signupHref = signup?.canSignup
    ? buildLeadSignupHref({ leadToken, signup })
    : null;
  const loginHref = buildLeadLoginHref(leadToken);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-2xl border bg-card text-center",
        compact ? "px-5 py-10" : "px-6 py-14",
      )}
    >
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
        <CheckCircle2 className="h-8 w-8 text-primary" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Demande envoyée</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {warning === "no_artisans"
            ? "Ta demande est enregistrée. Aucun artisan disponible dans ta zone pour l’instant — on te recontacte dès qu’il y en a un."
            : warning === "dispatch_pending"
              ? "Ta demande est bien enregistrée. Les artisans la recevront dans quelques minutes."
              : "Les artisans sélectionnés (2 à 3 maximum) reçoivent ta demande avec tes photos et ton estimation indicative, non engageante."}
        </p>
        <p className="mx-auto max-w-md text-xs text-muted-foreground">
          Estimation indicative uniquement — ce n’est pas un devis. Seule la proposition validée par
          l’artisan, après visite ou échange, fait foi.
        </p>
      </div>

      {canTrackOnline && signupHref ? (
        <div className="w-full max-w-sm space-y-3 pt-2">
          <p className="text-sm font-medium">Suivre ta demande en ligne</p>
          <Link href={signupHref} className={cn(buttonVariants({ size: "lg" }), "w-full gap-2")}>
            <UserPlus className="h-4 w-4" />
            Créer un compte gratuit
          </Link>
          <Link
            href={loginHref}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full gap-2")}
          >
            <MessageSquare className="h-4 w-4" />
            J’ai déjà un compte — voir mes messages
          </Link>
          <p className="text-xs text-muted-foreground">
            Optionnel — tu peux aussi attendre qu’un artisan te recontacte par e-mail ou téléphone.
          </p>
        </div>
      ) : (
        <p className="max-w-sm text-sm text-muted-foreground">
          Tu seras recontacté·e directement par téléphone ou e-mail. Aucun compte n’est nécessaire.
        </p>
      )}

      <Link href={getMarketingHomeHref()} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mt-2")}>
        Revenir à l’accueil
      </Link>
    </div>
  );
}
