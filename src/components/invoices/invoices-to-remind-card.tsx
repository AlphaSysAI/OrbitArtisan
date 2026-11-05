import Link from "next/link";
import { BellRing } from "lucide-react";

import { InvoiceReminderButton } from "@/components/invoices/invoice-reminder-button";
import { formatDateFr } from "@/lib/format/date";
import { formatCents } from "@/lib/format/money";

export type InvoiceToRemind = {
  id: string;
  invoiceNumber: string | null;
  customerName: string | null;
  grandTotalCents: number;
  dueDate: string;
  lastReminderAt: string | null;
  hasEmail: boolean;
};

/** Tableau de bord (formule sans relances automatiques) : factures échues à relancer en un clic. */
export function InvoicesToRemindCard({ invoices, total }: { invoices: InvoiceToRemind[]; total: number }) {
  if (!invoices.length) return null;
  const today = new Date();

  return (
    <section className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-0.5">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            <BellRing className="size-4 text-amber-600" aria-hidden />
            Factures à relancer
          </h2>
          <p className="text-sm text-muted-foreground">
            {total} facture{total > 1 ? "s" : ""} en retard de paiement. Un clic envoie un e-mail de relance au client.
          </p>
        </div>
        <Link href="/app/reglages?tab=abonnement" className="text-xs font-medium text-muted-foreground underline">
          Relances automatiques à partir de Pro
        </Link>
      </div>
      <ul className="divide-y rounded-xl border bg-background">
        {invoices.map((inv) => {
          const daysLate = Math.max(1, Math.floor((today.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000));
          return (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
              <Link href={`/app/invoices/${inv.id}`} className="min-w-0 flex-1 space-y-0.5 hover:underline">
                <p className="truncate text-sm font-medium">
                  {inv.customerName || "Client"} · {inv.invoiceNumber ?? "Facture"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCents(inv.grandTotalCents)} · {daysLate} j de retard
                  {inv.lastReminderAt ? ` · relancé le ${formatDateFr(inv.lastReminderAt)}` : " · jamais relancé"}
                </p>
              </Link>
              {inv.hasEmail ? (
                <InvoiceReminderButton invoiceId={inv.id} label="Relancer" />
              ) : (
                <span className="text-xs text-muted-foreground">Pas d&apos;e-mail client</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
