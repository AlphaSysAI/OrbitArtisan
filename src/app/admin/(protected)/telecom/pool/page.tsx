import { VoicePoolManager } from "@/components/admin/voice-pool-manager";
import { AppPageHeader } from "@/components/app/app-page-header";
import { AdminSetupAlert } from "@/components/admin/admin-setup-alert";
import { TelecomTabs } from "@/components/admin/telecom-tabs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { listVoiceNumberPool } from "@/lib/voice/voice-number-pool";
import { readProvisioningConfig } from "@/lib/voice/voice-pool-provisioning";
import { readRefillPolicy } from "@/lib/voice/voice-pool-refill";

// Achat par lot : ~5 s par numéro (Twilio + ElevenLabs), 10 max → au-delà du délai par défaut.
export const maxDuration = 120;

export default async function AdminVoicePoolPage() {
  const sb = createSupabaseServiceRoleClient();
  const { rows } = sb ? await listVoiceNumberPool(sb) : { rows: [] };
  const artisanIds = [...new Set(rows.flatMap((r) => [r.assigned_artisan_id, r.quarantined_artisan_id]).filter((v): v is string => Boolean(v)))];
  const { data: artisans } =
    sb && artisanIds.length ? await sb.from("profiles").select("id, business_name").in("id", artisanIds) : { data: [] };
  const artisanNames = Object.fromEntries((artisans ?? []).map((a) => [a.id as string, (a.business_name as string | null) ?? ""]));
  const cfg = readProvisioningConfig();
  const policy = readRefillPolicy();
  const provisioning = {
    configured: cfg.ok,
    missing: cfg.ok ? [] : cfg.missing,
    maxTotal: policy.maxTotal,
  };

  return (
    <div className="space-y-5">
      {!sb ? <AdminSetupAlert issue="missing_service_role" /> : null}
      <AppPageHeader
        eyebrow="Numéros Soline"
        title="Stock et attribution"
        description="1 abonnement Pro ou Premium = 1 numéro, attribué à la validation de l'abonnement. Résiliation : quarantaine 30 jours, puis restitution à Twilio."
      />
      <TelecomTabs current="pool" />
      <VoicePoolManager initialRows={rows} artisanNames={artisanNames} provisioning={provisioning} />
    </div>
  );
}
