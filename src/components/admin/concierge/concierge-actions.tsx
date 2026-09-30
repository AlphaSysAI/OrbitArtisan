"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  generateInviteAction,
  importProspectsAction,
  markInterestedAction,
  markOptOutAction,
  markUnavailableAction,
  setAlertStatusAction,
  updateProspectNotesAction,
} from "@/app/admin/(protected)/conciergerie/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

async function copy(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Lien copié");
  } catch {
    toast.message(url);
  }
}

/** Les 3 actions « au téléphone » + lien d'invitation. Gros boutons : utilisables sur mobile pendant l'appel. */
export function ProspectQuickActions({ prospectId, alertId = null }: { prospectId: string; alertId?: string | null }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await markInterestedAction({ prospectId, alertId });
              if (!res.ok) return void toast.error(res.error);
              setLink(res.url);
              if (res.sent) toast.success(res.channel === "sms" ? "SMS d'inscription envoyé" : "E-mail d'inscription envoyé");
              else {
                await copy(res.url);
                toast.warning(
                  res.channel === "none"
                    ? "Numéro fixe sans e-mail : lien copié, dictez-le ou envoyez-le vous-même."
                    : `${res.channel === "sms" ? "SMS" : "E-mail"} non envoyé : lien copié, transmettez-le à la main.`,
                );
              }
            })
          }
        >
          Intéressé
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await markUnavailableAction(prospectId);
              if (!res.ok) return void toast.error(res.error);
              toast.success("Noté : pas dispo");
            })
          }
        >
          Pas dispo
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await markOptOutAction(prospectId);
              if (!res.ok) return void toast.error(res.error);
              toast.success("Désinscrit : ne sera plus jamais suggéré");
            })
          }
        >
          Ne plus contacter
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await generateInviteAction({ prospectId, alertId });
              if (!res.ok) return void toast.error(res.error);
              setLink(res.url);
              await copy(res.url);
            })
          }
        >
          Lien d&apos;invitation
        </Button>
      </div>
      {link ? (
        <button
          type="button"
          onClick={() => copy(link)}
          className="block w-full truncate rounded-md bg-muted px-3 py-2 text-left font-mono text-xs"
          title="Copier"
        >
          {link}
        </button>
      ) : null}
    </div>
  );
}

export function AlertStatusButtons({ alertId, status }: { alertId: string; status: "open" | "handled" | "dismissed" }) {
  const [pending, start] = useTransition();
  const run = (next: "open" | "handled" | "dismissed") =>
    start(async () => {
      const res = await setAlertStatusAction({ alertId, status: next });
      if (!res.ok) toast.error(res.error);
    });
  if (status !== "open") {
    return (
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("open")}>
        Rouvrir
      </Button>
    );
  }
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run("handled")}>
        Traitée
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("dismissed")}>
        Ignorer
      </Button>
    </div>
  );
}

export function ProspectNotesForm({ prospectId, initial }: { prospectId: string; initial: string }) {
  const [notes, setNotes] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Textarea
        value={notes}
        maxLength={4000}
        rows={4}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Infos pro utiles uniquement (disponibilités, secteur…). Pas de données personnelles."
      />
      <Button
        size="sm"
        variant="outline"
        disabled={pending || notes === initial}
        onClick={() =>
          start(async () => {
            const res = await updateProspectNotesAction({ prospectId, notes });
            if (!res.ok) toast.error(res.error);
            else toast.success("Notes enregistrées");
          })
        }
      >
        Enregistrer
      </Button>
    </div>
  );
}

type ImportReport = { total: number; inserted: number; alreadyKnown: number; notGeocoded: number; rejected: { line: number; reason: string }[] };

const REASONS: Record<string, string> = {
  missing_name: "nom manquant",
  invalid_phone: "téléphone invalide",
  unknown_trade: "métier non reconnu",
  not_artisan: "commerce / fabricant / hors bâtiment",
  closed: "établissement fermé",
  duplicate_in_file: "doublon dans le fichier",
};

export function ProspectImportForm() {
  const [pending, start] = useTransition();
  const [report, setReport] = useState<ImportReport | null>(null);

  return (
    <form
      className="space-y-3"
      action={(fd) =>
        start(async () => {
          setReport(null);
          const res = await importProspectsAction(fd);
          if (!res.ok) return void toast.error(res.error);
          setReport(res);
          toast.success(`${res.inserted} prospect${res.inserted > 1 ? "s" : ""} ajouté${res.inserted > 1 ? "s" : ""}`);
        })
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <input name="file" type="file" accept=".xlsx,.csv,.json,.txt,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="text-sm" />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Import en cours…" : "Importer"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Excel (export Outscraper), CSV ou JSON. Colonnes lues : nom, type/sous-types/catégorie, téléphone, ville, code
        postal, coordonnées, statut. Tout le reste (e-mails, avis, dirigeant, réseaux…) est ignoré et jamais stocké.
        Commerces, fabricants, artistes et établissements fermés sont écartés.
        Dédoublonnage sur le téléphone : une fiche existante (statut, désinscription) n&apos;est jamais écrasée. 4 Mo / 5 000 lignes max.
      </p>
      {report ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p>
            {report.total} ligne{report.total > 1 ? "s" : ""} · <strong>{report.inserted} ajoutée{report.inserted > 1 ? "s" : ""}</strong> ·{" "}
            {report.alreadyKnown} déjà connue{report.alreadyKnown > 1 ? "s" : ""} · {report.rejected.length} rejetée
            {report.rejected.length > 1 ? "s" : ""}
            {report.notGeocoded ? ` · ${report.notGeocoded} sans coordonnées (exclues du matching)` : ""}
          </p>
          {report.rejected.length ? (
            <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-muted-foreground">
              {report.rejected.map((r) => (
                <li key={`${r.line}-${r.reason}`}>
                  Ligne {r.line} : {REASONS[r.reason] ?? r.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
