import type { SupabaseClient } from "@supabase/supabase-js";

import { Badge } from "@/components/ui/badge";
import { loadRecoveryPanelData } from "@/lib/recovery/load-recovery-panel";
import { RECOVERY_STATUS_LABELS } from "@/lib/recovery/types";

import { FormalNoticeCard } from "./formal-notice-card";
import { RecoveryCollectionModal } from "./recovery-collection-modal";

function formatEur(amountEuros: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amountEuros);
}

/**
 * Bloc recouvrement de la page facture : mise en demeure LRAR (J+30) puis
 * transmission au recouvrement contentieux (J+40 ou après mise en demeure).
 */
export async function RecoverySection({
  supabase,
  invoice,
  artisanId,
}: {
  supabase: SupabaseClient;
  artisanId: string;
  invoice: {
    id: string;
    invoice_number: string | null;
    status: string;
    due_date: string | null;
    grand_total: number | null;
    recovery_status?: unknown;
  };
}) {
  const data = await loadRecoveryPanelData(supabase, invoice, artisanId);

  // `null` : tables de recouvrement indisponibles — on n'affiche rien.
  if (!data) return null;

  // Rien à afficher tant que la facture n'est pas en souffrance.
  if (data.recoveryStatus === "none" && !data.canSendFormalNotice && !data.canSubmitToCollection) {
    return null;
  }

  const invoiceNumber = invoice.invoice_number ?? invoice.id.slice(0, 8).toUpperCase();

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Recouvrement</h2>
        {data.recoveryStatus !== "none" && (
          <Badge variant={data.recoveryStatus === "collected" ? "default" : "secondary"}>
            {RECOVERY_STATUS_LABELS[data.recoveryStatus]}
          </Badge>
        )}
      </div>

      <FormalNoticeCard
        invoiceId={data.invoiceId}
        amountDueCents={data.amountDueCents}
        daysOverdue={data.daysOverdue}
        notice={data.notice}
        canSend={data.canSendFormalNotice}
        quota={data.quota}
      />

      {data.collectionCase ? (
        <div className="rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">
          <p className="font-medium">Dossier confié au recouvrement</p>
          <dl className="mt-2 grid gap-1">
            {data.collectionCase.rubypayeurCaseId && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Référence dossier</dt>
                <dd className="font-mono">{data.collectionCase.rubypayeurCaseId}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Créance</dt>
              <dd>{formatEur(data.collectionCase.amountTotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Déjà recouvré</dt>
              <dd>{formatEur(data.collectionCase.amountCollected)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        data.canSubmitToCollection && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">
            <p className="flex-1 text-muted-foreground">
              La créance reste impayée ? Confie-la à notre partenaire de recouvrement, sans frais en
              cas d&apos;échec.
            </p>
            <RecoveryCollectionModal
              invoiceId={data.invoiceId}
              invoiceNumber={invoiceNumber}
              amountDueCents={data.amountDueCents}
              hasFormalNotice={data.notice !== null}
            />
          </div>
        )
      )}
    </section>
  );
}
