import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, Mail, Paperclip } from "lucide-react";

import { AppPageHeader } from "@/components/app/app-page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { nextSendLabel, periodLabel } from "@/lib/accounting/export-schedule";
import { listPendingPieces } from "@/lib/accounting/pending-pieces";
import { getCurrentUser, getRequestSupabase } from "@/lib/auth/session";

import { AccountingPiecesUploader } from "./accounting-pieces-uploader";
import { AccountingSettingsForm } from "./accounting-settings-form";

export const dynamic = "force-dynamic";

type ExportRow = {
  period_start: string;
  status: "scheduled" | "sent" | "skipped" | "failed";
  sent_at: string | null;
  recipient_email: string | null;
  invoice_count: number;
  attachment_count: number;
  email_parts: number;
};

function statusLabel(row: ExportRow): string {
  switch (row.status) {
    case "sent":
      return `Envoyé${row.sent_at ? ` le ${new Date(row.sent_at).toLocaleDateString("fr-FR")}` : ""} — ${row.invoice_count} facture${row.invoice_count > 1 ? "s" : ""}${row.attachment_count ? `, ${row.attachment_count} pièce${row.attachment_count > 1 ? "s" : ""}` : ""}${row.email_parts > 1 ? ` (${row.email_parts} e-mails)` : ""}`;
    case "skipped":
      return "Rien à envoyer";
    case "failed":
      return "Échec — nouvelle tentative automatique";
    default:
      return "Prévu";
  }
}

export default async function AccountingExportPage() {
  const [supabase, user] = await Promise.all([getRequestSupabase(), getCurrentUser()]);
  if (!user) redirect("/login?next=/app/invoices/envoi-comptable");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, accountant_email, accounting_export_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.id) redirect("/app/reglages?tab=activite");

  const [pieces, historyRes] = await Promise.all([
    listPendingPieces(supabase, profile.id as string),
    supabase
      .from("accounting_exports")
      .select("period_start, status, sent_at, recipient_email, invoice_count, attachment_count, email_parts")
      .eq("artisan_id", profile.id)
      .order("period_start", { ascending: false })
      .limit(12),
  ]);
  const history = (historyRes.data ?? []) as ExportRow[];
  const enabled = Boolean(profile.accounting_export_enabled);
  const accountant = (profile.accountant_email as string | null) ?? "";

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Encaissement"
        title="Envoi comptable"
        description="Vos factures du mois partent chez votre comptable le dernier jour du mois, avec les pièces que vous ajoutez."
        action={
          <Link href="/app/invoices" className={buttonVariants({ variant: "outline", size: "lg", className: "gap-2" })}>
            <ArrowLeft className="size-4" />
            Factures
          </Link>
        }
      />

      {enabled ? (
        <Alert>
          <CalendarClock className="size-4" />
          <AlertTitle>Prochain envoi : {nextSendLabel(new Date())} au soir</AlertTitle>
          <AlertDescription>
            À {accountant}, avec vous en copie : factures émises depuis le dernier envoi (PDF Factur-X + récapitulatif
            CSV) et {pieces.length} pièce{pieces.length > 1 ? "s" : ""} ajoutée{pieces.length > 1 ? "s" : ""}.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="app-surface space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Paperclip className="size-5 text-brand" aria-hidden />
          <h2 className="font-display text-lg font-semibold">Pièces à joindre au prochain envoi</h2>
        </div>
        <AccountingPiecesUploader
          profileId={profile.id as string}
          initialPieces={pieces.map((p) => ({ path: p.path, name: p.name, size: p.size }))}
        />
      </section>

      <section className="app-surface space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Mail className="size-5 text-brand" aria-hidden />
          <h2 className="font-display text-lg font-semibold">Comptable</h2>
        </div>
        <AccountingSettingsForm initialEmail={accountant} initialEnabled={enabled} />
      </section>

      {history.length > 0 ? (
        <section className="app-surface space-y-3 p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold">Historique</h2>
          <ul className="divide-y text-sm">
            {history.map((row) => (
              <li key={row.period_start} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="font-medium capitalize">{periodLabel(row.period_start)}</span>
                <span className={row.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                  {statusLabel(row)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
