"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { lookupVoiceNumberAt, type VoiceAssignmentHistoryRow } from "@/app/admin/(protected)/telecom/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatInstant(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "medium",
      timeZone: "Europe/Paris",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function SnapshotBlock({ snapshot }: { snapshot: VoiceAssignmentHistoryRow["artisan_snapshot"] }) {
  const rows: [string, string | null | undefined][] = [
    ["Raison sociale", snapshot.business_name],
    ["Contact", snapshot.name],
    ["E-mail", snapshot.email],
    ["SIRET", snapshot.siret],
    ["SIREN", snapshot.siren],
    ["N° TVA", snapshot.vat_number],
    [
      "Adresse",
      [snapshot.address_line1, snapshot.postal_code, snapshot.city].filter(Boolean).join(", ") || null,
    ],
    ["Téléphone profil", snapshot.phone],
    ["IP inscription", snapshot.registration_ip],
    [
      "Horodatage IP inscription",
      snapshot.registration_recorded_at ? formatInstant(snapshot.registration_recorded_at) : null,
    ],
    ["Profil (UUID)", snapshot.profile_id],
    ["Compte auth (UUID)", snapshot.user_id],
  ];

  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) =>
        value ? (
          <div key={label} className="rounded-lg border bg-muted/30 px-3 py-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 font-medium break-all">{value}</dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}

export function TelecomLookupForm({
  initialPhone,
  initialInstant,
}: {
  initialPhone: string;
  initialInstant: string;
}) {
  const router = useRouter();
  const [phone, setPhone] = React.useState(initialPhone);
  const [instantLocal, setInstantLocal] = React.useState(() => {
    if (!initialInstant) return "";
    const d = new Date(initialInstant);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  });
  const [pending, setPending] = React.useState(false);
  const [match, setMatch] = React.useState<VoiceAssignmentHistoryRow | null>(null);
  const [history, setHistory] = React.useState<VoiceAssignmentHistoryRow[]>([]);

  React.useEffect(() => {
    if (!initialPhone.trim()) return;
    void runLookup(initialPhone, initialInstant);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement initial depuis l'URL
  }, []);

  async function runLookup(phoneValue: string, instantIso?: string) {
    setPending(true);
    const res = await lookupVoiceNumberAt({ phoneE164: phoneValue, instantIso });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setMatch(res.match);
    setHistory(res.history);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const instantIso = instantLocal
      ? new Date(instantLocal).toISOString()
      : new Date().toISOString();
    const qs = new URLSearchParams({ phone: phone.trim() });
    if (instantLocal) qs.set("at", instantIso);
    router.replace(`/admin/telecom?${qs.toString()}`);
    await runLookup(phone, instantIso);
  }

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded-2xl border bg-card p-6">
        <div className="space-y-2">
          <Label htmlFor="telecom-phone">Numéro (E.164)</Label>
          <Input
            id="telecom-phone"
            name="phone"
            className="font-mono"
            placeholder="+339XXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telecom-at">Date et heure (optionnel)</Label>
          <Input
            id="telecom-at"
            type="datetime-local"
            step={1}
            value={instantLocal}
            onChange={(e) => setInstantLocal(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Laisse vide pour « maintenant ». Fuseau local du navigateur ; stockage en UTC (timestamptz).
          </p>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Recherche…" : "Rechercher le titulaire"}
        </Button>
      </form>

      {match ? (
        <section className="space-y-4 rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="text-lg font-semibold">Titulaire à l&apos;instant demandé</h2>
          <p className="text-sm text-muted-foreground">
            Mise à disposition : {formatInstant(match.assigned_at)}
            {match.released_at
              ? ` — Fin : ${formatInstant(match.released_at)} (${match.release_reason ?? "—"})`
              : " — Toujours actif à cet instant"}
          </p>
          <SnapshotBlock snapshot={match.artisan_snapshot} />
        </section>
      ) : history.length > 0 ? (
        <p className="text-sm text-amber-800">Aucun rattachement actif à l&apos;instant demandé.</p>
      ) : null}

      {history.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Historique du numéro ({history.length})</h2>
          <ul className="space-y-4">
            {history.map((row) => (
              <li key={row.id} className="rounded-2xl border bg-card p-5">
                <p className="text-sm font-medium">
                  {formatInstant(row.assigned_at)}
                  {row.released_at ? ` → ${formatInstant(row.released_at)}` : " → en cours"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.assigned_by}
                  {row.release_reason ? ` · fin : ${row.release_reason}` : ""}
                </p>
                <div className="mt-3">
                  <SnapshotBlock snapshot={row.artisan_snapshot} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
