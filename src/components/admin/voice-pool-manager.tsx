"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  adminAddVoiceNumberToPool,
  adminProvisionVoiceNumbers,
  adminRetirePoolNumber,
  adminRetryElevenLabsImport,
} from "@/app/admin/(protected)/telecom/pool/actions";
import { ConfirmButton } from "@/components/admin/ui/confirm-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateFr } from "@/lib/format/date";
import { formatPhoneFr } from "@/lib/phone";
import type { VoiceNumberPoolRow } from "@/lib/voice/voice-number-pool";

const STATUS: Record<VoiceNumberPoolRow["status"], { label: string; className: string; order: number }> = {
  available: { label: "Disponible", className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300", order: 0 },
  assigned: { label: "Attribué", className: "border-primary/40 text-primary", order: 1 },
  quarantine: { label: "Quarantaine", className: "border-amber-400/60 text-amber-700 dark:text-amber-300", order: 2 },
  retired: { label: "Retiré", className: "text-muted-foreground", order: 3 },
};

export function VoicePoolManager({
  initialRows,
  artisanNames,
  provisioning,
}: {
  initialRows: VoiceNumberPoolRow[];
  artisanNames: Record<string, string>;
  provisioning: { configured: boolean; missing: string[]; maxTotal: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [provisionCount, setProvisionCount] = useState("1");
  const [report, setReport] = useState<{ error: boolean; text: string } | null>(null);
  const [showRetired, setShowRetired] = useState(false);

  const rows = [...initialRows]
    .filter((r) => showRetired || r.status !== "retired")
    .sort((a, b) => STATUS[a.status].order - STATUS[b.status].order || a.phone_e164.localeCompare(b.phone_e164));
  const ready = initialRows.filter((r) => r.status === "available" && r.elevenlabs_ready).length;
  const broken = initialRows.filter((r) => r.status === "available" && !r.elevenlabs_ready).length;
  const assigned = initialRows.filter((r) => r.status === "assigned").length;
  const quarantine = initialRows.filter((r) => r.status === "quarantine").length;
  const retiredCount = initialRows.filter((r) => r.status === "retired").length;

  const artisanFor = (r: VoiceNumberPoolRow) => r.assigned_artisan_id ?? r.quarantined_artisan_id ?? null;

  const onAdd = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const result = await adminAddVoiceNumberToPool(fd);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Numéro ajouté au stock");
      form.reset();
      router.refresh();
    });
  };

  const provision = async () => {
    setReport(null);
    const result = await adminProvisionVoiceNumbers(Number.parseInt(provisionCount, 10));
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    const bought = result.results.filter((r) => r.ok);
    const failure = result.results.find((r) => !r.ok);
    const warnings = result.results.filter((r) => r.ok && r.warning).map((r) => (r.ok ? r.warning : ""));
    setReport({
      error: Boolean(failure || warnings.length),
      text: [
        `${bought.length} numéro${bought.length > 1 ? "s" : ""} acheté${bought.length > 1 ? "s" : ""}${bought.length ? ` : ${bought.map((r) => (r.ok ? r.phoneE164 : "")).join(", ")}` : ""}.`,
        result.served ? `${result.served} compte${result.served > 1 ? "s" : ""} en attente servi${result.served > 1 ? "s" : ""}.` : "",
        result.capped ? "Quantité réduite pour respecter le plafond." : "",
        ...warnings,
        failure && !failure.ok ? `Arrêt : ${failure.error}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
    if (bought.length) router.refresh();
  };

  const rowActions = (row: VoiceNumberPoolRow) => (
    <div className="flex flex-wrap justify-end gap-2">
      {!row.elevenlabs_ready && provisioning.configured && row.status !== "retired" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await adminRetryElevenLabsImport(row.id);
              if (!result.ok) return void toast.error(result.error);
              toast.success("Numéro branché sur ElevenLabs");
              router.refresh();
            })
          }
        >
          Relancer ElevenLabs
        </Button>
      ) : null}
      {row.status === "available" ? (
        <ConfirmButton
          variant="ghost"
          destructive
          title={`Retirer ${formatPhoneFr(row.phone_e164)} du stock ?`}
          description="Le numéro ne sera plus attribué. Il reste facturé par Twilio tant qu'il n'y est pas restitué."
          confirmLabel="Retirer"
          onConfirm={async () => {
            const result = await adminRetirePoolNumber(row.id);
            if (!result.ok) {
              toast.error(result.error);
              return false;
            }
            toast.success("Numéro retiré du stock");
            router.refresh();
          }}
        >
          Retirer
        </ConfirmButton>
      ) : null}
    </div>
  );

  const artisanCell = (row: VoiceNumberPoolRow) => {
    const id = artisanFor(row);
    if (!id) return <span className="text-muted-foreground">—</span>;
    return (
      <Link href={`/admin/tenants/${id}`} className="hover:underline">
        {artisanNames[id] || "Artisan sans raison sociale"}
      </Link>
    );
  };

  const detail = (row: VoiceNumberPoolRow) =>
    row.status === "quarantine" && row.quarantine_until
      ? `jusqu'au ${formatDateFr(row.quarantine_until)}`
      : !row.elevenlabs_ready && row.status !== "retired"
        ? `Non branché ElevenLabs${row.notes ? ` : ${row.notes}` : ""}`
        : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Prêts à attribuer", value: ready, warn: ready < 2 },
          { label: "Attribués", value: assigned },
          { label: "En quarantaine", value: quarantine },
          { label: "En erreur ElevenLabs", value: broken, warn: broken > 0 },
        ].map((t) => (
          <div key={t.label} className={`rounded-2xl border bg-card p-4 shadow-sm ${t.warn ? "border-amber-400/60" : ""}`}>
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{t.value}</p>
          </div>
        ))}
      </div>

      {report ? (
        <Alert variant={report.error ? "destructive" : "default"}>
          <p>{report.text}</p>
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">Aucun numéro dans le stock.</p>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {rows.map((row) => (
              <li key={row.id} className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-medium">{formatPhoneFr(row.phone_e164)}</span>
                  <Badge variant="outline" className={STATUS[row.status].className}>
                    {STATUS[row.status].label}
                  </Badge>
                </div>
                <p className="text-sm">{artisanCell(row)}</p>
                {detail(row) ? <p className="text-xs text-muted-foreground">{detail(row)}</p> : null}
                {rowActions(row)}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Numéro</th>
                  <th className="px-4 py-3 font-medium">État</th>
                  <th className="px-4 py-3 font-medium">Artisan</th>
                  <th className="px-4 py-3 font-medium">Détail</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-mono">{formatPhoneFr(row.phone_e164)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={STATUS[row.status].className}>
                        {STATUS[row.status].label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{artisanCell(row)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{detail(row) ?? "—"}</td>
                    <td className="px-4 py-3">{rowActions(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {retiredCount ? (
        <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={() => setShowRetired((v) => !v)}>
          {showRetired ? "Masquer les numéros retirés" : `Afficher les ${retiredCount} numéro${retiredCount > 1 ? "s" : ""} retiré${retiredCount > 1 ? "s" : ""}`}
        </button>
      ) : null}

      <details className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <summary className="cursor-pointer font-medium">Acheter des numéros (dépannage)</summary>
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            Les numéros s&apos;achètent automatiquement à chaque abonnement Pro ou Premium. Ici, seulement pour débloquer un
            abonné en attente : un numéro acheté et non attribué reste facturé chaque mois par Twilio. Plafond :{" "}
            {provisioning.maxTotal} numéros.
          </p>
          {provisioning.configured ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="provision_count">Quantité (1 à 10)</Label>
                <Input
                  id="provision_count"
                  type="number"
                  min={1}
                  max={10}
                  value={provisionCount}
                  onChange={(e) => setProvisionCount(e.target.value)}
                  className="w-24"
                />
              </div>
              <ConfirmButton
                variant="default"
                title={`Acheter ${provisionCount} numéro${Number(provisionCount) > 1 ? "s" : ""} Twilio ?`}
                description="Achat réel et récurrent (abonnement mensuel Twilio par numéro), puis import dans ElevenLabs."
                confirmLabel="Acheter"
                onConfirm={provision}
              >
                Acheter et brancher
              </ConfirmButton>
            </div>
          ) : (
            <p className="text-sm text-destructive">Variables manquantes sur Vercel : {provisioning.missing.join(", ")}.</p>
          )}
        </div>
      </details>

      <details className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <summary className="cursor-pointer font-medium">Ajouter un numéro déjà acheté</summary>
        <form onSubmit={onAdd} className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">Numéro déjà acheté sur Twilio et branché sur l&apos;agent ElevenLabs.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="phone_e164">Numéro</Label>
              <Input id="phone_e164" name="phone_e164" placeholder="+339XXXXXXXX" required disabled={pending} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="twilio_sid">Twilio Incoming SID (facultatif)</Label>
              <Input id="twilio_sid" name="twilio_sid" placeholder="PN…" disabled={pending} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Note interne</Label>
            <Input id="notes" name="notes" disabled={pending} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="elevenlabs_ready" defaultChecked disabled={pending} />
            Déjà branché sur ElevenLabs (sinon non attribuable)
          </label>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Enregistrement…" : "Ajouter au stock"}
          </Button>
        </form>
      </details>
    </div>
  );
}
