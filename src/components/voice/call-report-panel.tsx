import { AlertTriangle, CheckCircle2, CircleDashed, HelpCircle } from "lucide-react";

import {
  CALL_INTENT_LABELS,
  URGENCY_LABELS,
  type CallReport,
  type CallReportAction,
} from "@/lib/voice/call-report";

export { readCallReport } from "@/lib/voice/call-report";
import { cn } from "@/lib/utils";

const DECLARED_LABELS: Record<string, string> = {
  need: "Besoin",
  location: "Lieu",
  building: "Bâtiment",
  zone: "Zone",
  dimensions: "Dimensions",
  access: "Accès",
  deadline: "Échéance",
  availability: "Disponibilités",
};

const ACTION_STATUS: Record<CallReportAction["status"], { label: string; className: string }> = {
  en_attente_validation: { label: "En attente de ta validation", className: "text-amber-700 dark:text-amber-400" },
  confirme: { label: "Confirmé", className: "text-emerald-700 dark:text-emerald-400" },
  annule: { label: "Annulé / remplacé", className: "text-muted-foreground line-through" },
  brouillon_a_valider: { label: "Brouillon à relire", className: "text-amber-700 dark:text-amber-400" },
};

/**
 * Compte rendu d'appel : ce que l'appelant a DÉCLARÉ (non vérifié) séparé de ce qui a été
 * FAIT (lu en base) et de ce que l'artisan doit valider.
 */
export function CallReportPanel({ report }: { report: CallReport }) {
  const a = report.analysis;
  const declared = a
    ? Object.entries(a.declared).filter((entry): entry is [string, string] => Boolean(entry[1]))
    : [];

  return (
    <div className="space-y-3 rounded-lg border border-border/60 px-4 py-3 text-sm">
      {a ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{CALL_INTENT_LABELS[a.intent]}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                a.urgency.level === "danger"
                  ? "bg-red-600 text-white"
                  : a.urgency.level === "intervention_rapide"
                    ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {URGENCY_LABELS[a.urgency.level]}
            </span>
          </div>
          {a.urgency.facts.length ? (
            <p className="text-xs text-muted-foreground">Selon l&apos;appelant : {a.urgency.facts.join(" ; ")}</p>
          ) : null}

          {declared.length ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Déclaré par l&apos;appelant (non vérifié)
              </p>
              <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                {declared.map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-muted-foreground">{DECLARED_LABELS[key] ?? key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {a.missing.length ? (
            <p className="flex gap-2">
              <HelpCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <span className="font-medium">Manque :</span> {a.missing.join(", ")}
              </span>
            </p>
          ) : null}
          {a.contradictions.length ? (
            <p className="flex gap-2 text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">À clarifier :</span> {a.contradictions.join(" ; ")}
              </span>
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground">
          Compte rendu automatique indisponible pour cet appel : lis la transcription.
        </p>
      )}

      {report.actions.length ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fait pendant l&apos;appel</p>
          <ul className="mt-1 space-y-1">
            {report.actions.map((action, i) => (
              <li key={`${action.type}-${action.reference ?? i}`} className="flex gap-2">
                {action.status === "confirme" ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span>
                  {action.type === "rendez_vous" ? `Rendez-vous ${action.label}` : action.label} —{" "}
                  <span className={ACTION_STATUS[action.status].className}>{ACTION_STATUS[action.status].label}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.humanValidation.length ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">À faire</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {report.humanValidation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
