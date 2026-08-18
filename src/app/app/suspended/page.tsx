import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";

export default function SuspendedAccountPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-6 py-12">
      <Alert variant="destructive">
        <AlertTitle>Compte suspendu</AlertTitle>
        <AlertDescription>
          L&apos;accès à votre espace pro Soline a été temporairement suspendu. Contactez le support ou régularisez
          votre abonnement pour réactiver votre compte.
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-3">
        <Link href="/login" className={buttonVariants({ variant: "outline" })}>
          Se reconnecter
        </Link>
        <a href="mailto:support@solinebtp.fr" className={buttonVariants({ variant: "default" })}>
          Contacter le support
        </a>
      </div>
    </div>
  );
}
