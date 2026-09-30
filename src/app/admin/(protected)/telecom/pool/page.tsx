import Link from "next/link";

import { VoicePoolManager } from "@/components/admin/voice-pool-manager";
import { AppPageHeader } from "@/components/app/app-page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { listVoiceNumberPool } from "@/lib/voice/voice-number-pool";
import { readProvisioningConfig } from "@/lib/voice/voice-pool-provisioning";
import { readRefillPolicy } from "@/lib/voice/voice-pool-refill";

// Achat par lot : ~5 s par numéro (Twilio + ElevenLabs), 10 max → au-delà du délai par défaut.
export const maxDuration = 120;

export default async function AdminVoicePoolPage() {
  const sb = createSupabaseServiceRoleClient();
  const { rows } = sb ? await listVoiceNumberPool(sb) : { rows: [] };
  const cfg = readProvisioningConfig();
  const policy = readRefillPolicy();
  const provisioning = {
    configured: cfg.ok,
    missing: cfg.ok ? [] : cfg.missing,
    autoRefill: process.env.VOICE_POOL_AUTO_REFILL?.trim() === "true",
    maxTotal: policy.maxTotal,
    minAvailable: policy.minAvailable,
  };

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
      <VoicePoolManager initialRows={rows} provisioning={provisioning} />
    </div>
  );
}
