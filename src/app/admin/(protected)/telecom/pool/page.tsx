import Link from "next/link";

import { VoicePoolManager } from "@/components/admin/voice-pool-manager";
import { AppPageHeader } from "@/components/app/app-page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { listVoiceNumberPool } from "@/lib/voice/voice-number-pool";

export default async function AdminVoicePoolPage() {
  const sb = createSupabaseServiceRoleClient();
  const { rows } = sb ? await listVoiceNumberPool(sb) : { rows: [] };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <AppPageHeader
          eyebrow="Télécom"
          title="Pool numéros Soline"
          description="Numéros Twilio pré-provisionnés, attribués automatiquement aux artisans Pro/Premium."
        />
        <Link href="/admin/telecom" className={buttonVariants({ variant: "outline" })}>
          Registre réquisitions
        </Link>
      </div>
      <VoicePoolManager initialRows={rows} />
    </div>
  );
}
