"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { updateInvoiceDetail } from "./invoice-detail-actions";

export function InvoiceEditForm({
  invoiceId,
  invoiceNumber,
  status,
  notes,
  isDraft,
}: {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  notes: string;
  isDraft: boolean;
}) {
  return (
    <form action={updateInvoiceDetail} className="space-y-6">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="invoice_number">Numéro de facture</Label>
          <Input id="invoice_number" name="invoice_number" defaultValue={invoiceNumber} placeholder="FAC-…" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Statut</Label>
          <select
            id="status"
            name="status"
            defaultValue={status || "draft"}
            disabled={isDraft}
            className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="draft">Brouillon</option>
            <option value="sent">Envoyée</option>
            <option value="overdue">En retard</option>
            <option value="paid">Payée</option>
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={notes} rows={4} />
      </div>
      <Button type="submit">Enregistrer</Button>
    </form>
  );
}
