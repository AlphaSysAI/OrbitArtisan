"use client";

import { FormEvent, useState, useTransition } from "react";

import {
  adminAddVoiceNumberToPool,
  adminProvisionVoiceNumbers,
  adminRetirePoolNumber,
  adminRetryElevenLabsImport,
} from "@/app/admin/(protected)/telecom/pool/actions";
import type { VoiceNumberPoolRow } from "@/lib/voice/voice-number-pool";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function statusBadge(status: VoiceNumberPoolRow["status"]) {
  if (status === "available") {
    return (
      <Badge variant="outline" className="border-success/40 text-success">
        Disponible
      </Badge>
    );
  }
  if (status === "assigned") {
    return (
      <Badge variant="outline" className="border-primary/40 text-primary">
        Attribué
      </Badge>
    );
  }
  if (status === "quarantine") {
    return (
      <Badge variant="outline" className="border-amber-400/60 text-amber-700">
        Quarantaine
      </Badge>
    );
  }
  return <Badge variant="outline">Retiré</Badge>;
}

export function VoicePoolManager({
  initialRows,
  provisioning,
}: {
  initialRows: VoiceNumberPoolRow[];
  provisioning: { configured: boolean; missing: string[]; autoRefill: boolean; maxTotal: number; minAvailable: number };
}) {
  const [rows, setRows] = useState(initialRows);
  const [provisionCount, setProvisionCount] = useState("1");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const availableCount = rows.filter((r) => r.status === "available" && r.elevenlabs_ready).length;

  const onAdd = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const result = await adminAddVoiceNumberToPool(fd);
      if (result.ok) {
        setMessage({ type: "success", text: "Numéro ajouté au pool." });
        form.reset();
        window.location.reload();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  };

  const onProvision = () => {
    setMessage(null);
    const count = Number.parseInt(provisionCount, 10);
    startTransition(async () => {
      const result = await adminProvisionVoiceNumbers(count);
      if (!result.ok) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      const bought = result.results.filter((r) => r.ok);
      const failure = result.results.find((r) => !r.ok);
      const warnings = result.results.filter((r) => r.ok && r.warning).map((r) => (r.ok ? r.warning : ""));
      const parts = [
        `${bought.length} numéro(s) acheté(s) : ${bought.map((r) => (r.ok ? r.phoneE164 : "")).join(", ") || "—"}.`,
        result.served ? `${result.served} compte(s) en attente servi(s).` : "",
        result.capped ? "Quantité réduite pour respecter le plafond." : "",
        ...warnings,
        failure && !failure.ok ? `Arrêt : ${failure.error}` : "",
      ].filter(Boolean);
      setMessage({ type: failure || warnings.length ? "error" : "success", text: parts.join(" ") });
      if (bought.length) window.location.reload();
    });
  };

  const onRetryElevenLabs = (id: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await adminRetryElevenLabsImport(id);
      if (result.ok) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, elevenlabs_ready: true, notes: null } : r)));
        setMessage({ type: "success", text: "Numéro branché sur ElevenLabs." });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  };

  const onRetire = (id: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await adminRetirePoolNumber(id);
      if (result.ok) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "retired" as const } : r)));
        setMessage({ type: "success", text: "Numéro retiré du pool." });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  };

  return (
    <div className="space-y-8">
      {message ? (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          <p>{message.text}</p>
        </Alert>
      ) : null}

      <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{availableCount}</strong> numéro(s) prêt(s) pour attribution auto
          (Pro/Premium à l&apos;abonnement).
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <h2 className="font-display text-lg font-semibold tracking-tight">Provisionner automatiquement</h2>
        <p className="text-sm text-muted-foreground">
          Achat Twilio (numéro français) → import ElevenLabs + agent Soline → URL de statut → pool. Chaque numéro
          est facturé tous les mois par Twilio. Plafond : {provisioning.maxTotal} numéros actifs. Réassort
          automatique : {provisioning.autoRefill ? `activé (sous ${provisioning.minAvailable} numéros libres)` : "désactivé"}.
        </p>
        {provisioning.configured ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="provision_count">Quantité (1 à 10)</Label>
              <Input
                id="provision_count"
                type="number"
                min={1}
                max={10}
                value={provisionCount}
                onChange={(e) => setProvisionCount(e.target.value)}
                className="w-24"
                disabled={pending}
              />
            </div>
            <Button type="button" disabled={pending} onClick={onProvision}>
              {pending ? "Provisionnement…" : "Acheter et brancher"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-destructive">
            Variables manquantes sur Vercel : {provisioning.missing.join(", ")}.
          </p>
        )}
      </div>

      <form onSubmit={onAdd} className="space-y-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <h2 className="font-display text-lg font-semibold tracking-tight">Ajouter un numéro Twilio</h2>
        <p className="text-sm text-muted-foreground">
          Le numéro doit déjà être acheté sur Twilio et branché sur l&apos;agent ElevenLabs.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone_e164">E.164</Label>
            <Input id="phone_e164" name="phone_e164" placeholder="+339XXXXXXXX" required disabled={pending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="twilio_sid">Twilio Incoming SID (optionnel)</Label>
            <Input id="twilio_sid" name="twilio_sid" placeholder="PN…" disabled={pending} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notes internes</Label>
          <Input id="notes" name="notes" disabled={pending} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="elevenlabs_ready" defaultChecked disabled={pending} />
          Prêt ElevenLabs (sinon non attribuable)
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Ajouter au pool"}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border/70 bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Numéro</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">ElevenLabs</th>
              <th className="px-4 py-3 font-medium">Artisan</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Aucun numéro dans le pool — ajoutez vos numéros Twilio ci-dessus.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 font-mono">{row.phone_e164}</td>
                  <td className="px-4 py-3">{statusBadge(row.status)}</td>
                  <td className="px-4 py-3">
                    {row.elevenlabs_ready ? (
                      "Oui"
                    ) : (
                      <span className="space-y-1">
                        <span className="block">Non</span>
                        {row.notes ? <span className="block text-xs text-muted-foreground">{row.notes}</span> : null}
                        {provisioning.configured && row.status !== "retired" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() => onRetryElevenLabs(row.id)}
                          >
                            Réessayer ElevenLabs
                          </Button>
                        ) : null}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {row.assigned_artisan_id ? row.assigned_artisan_id.slice(0, 8) + "…" : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.status === "available" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => onRetire(row.id)}
                      >
                        Retirer
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
