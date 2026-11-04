import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { pendingAccountDeletion } from "@/lib/account/account-deletion";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDateFr } from "@/lib/format/date";
import { LEGAL_PUBLISHER } from "@/lib/legal/site-legal-info";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Suppression demandée par l'artisan ? (et non un simple archivage admin, qui pose aussi
 * deleted_at). account_deletions n'est lisible qu'en service role : lecture limitée au profil
 * de l'utilisateur connecté.
 */
async function pendingDeletionOfCurrentArtisan() {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  const admin = createSupabaseServiceRoleClient();
  if (!data?.id || !admin) return null;
  return pendingAccountDeletion(admin, data.id as string);
}

export default async function SuspendedAccountPage() {
  const deletion = await pendingDeletionOfCurrentArtisan();

  if (deletion) {
    const purgeDate = formatDateFr(deletion.purgeAfter, { dateStyle: "long" });
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-6 py-12">
        <Alert variant="destructive">
          <AlertTitle>Compte fermé</AlertTitle>
          <AlertDescription>
            Ce compte a été fermé. Vos données seront définitivement effacées le {purgeDate}. D&apos;ici là, pour obtenir
            une copie de vos données ou rouvrir le compte, écrivez à {LEGAL_PUBLISHER.email}.
          </AlertDescription>
        </Alert>
        <a href={`mailto:${LEGAL_PUBLISHER.email}`} className={buttonVariants({ variant: "default", className: "w-fit" })}>
          Écrire à Soline
        </a>
      </div>
    );
  }

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
