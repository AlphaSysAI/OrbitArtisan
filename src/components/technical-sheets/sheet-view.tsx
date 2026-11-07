import { AlertTriangle, BadgeCheck, BookMarked, CheckCircle2, Clock, HardHat, Package, ShieldAlert, Sparkles, Wrench } from "lucide-react";
import type { ReactNode } from "react";

import type { TechnicalSheetContent } from "@/lib/technical-sheets/types";
import { cn } from "@/lib/utils";

export type SheetTrust =
  | { kind: "verified"; reviewerName: string | null; reviewedAt: string }
  | { kind: "in_review" }
  /** Fiche dépannage SolineBTP côté particulier, pas encore relue par un pro. */
  | { kind: "house" }
  | { kind: "ai" };

export const SHEET_DISCLAIMER =
  "Aide-mémoire destiné aux professionnels qualifiés. Il ne remplace ni les normes et DTU en vigueur, ni les notices des fabricants, ni les habilitations obligatoires. Vérifiez toujours les règles applicables à votre chantier.";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function SheetTrustBadge({ trust, className }: { trust: SheetTrust; className?: string }) {
  const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium";
  if (trust.kind === "verified") {
    return (
      <span className={cn(base, "bg-success/10 text-success", className)}>
        <BadgeCheck className="size-3.5" aria-hidden /> Vérifiée
      </span>
    );
  }
  if (trust.kind === "ai") {
    return (
      <span className={cn(base, "bg-warning/15 text-warning-foreground dark:text-warning", className)}>
        <Sparkles className="size-3.5" aria-hidden /> Générée par l&apos;IA · non vérifiée
      </span>
    );
  }
  if (trust.kind === "house") {
    return (
      <span className={cn(base, "bg-primary/10 text-primary", className)}>
        <BookMarked className="size-3.5" aria-hidden /> Fiche SolineBTP
      </span>
    );
  }
  return (
    <span className={cn(base, "bg-muted text-muted-foreground", className)}>
      <Clock className="size-3.5" aria-hidden /> En cours de relecture
    </span>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 break-inside-avoid">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

/** Contenu complet d'une fiche technique (bibliothèque ou IA), imprimable. */
export function TechnicalSheetView({
  sheet,
  trust,
  meta,
  badges,
  disclaimer = SHEET_DISCLAIMER,
  children,
}: {
  sheet: TechnicalSheetContent;
  trust: SheetTrust;
  /** Ligne d'information sous le titre (métiers concernés, date…). */
  meta?: string;
  /** Étiquettes en plus du statut (ex. niveau de difficulté côté particulier). */
  badges?: ReactNode;
  /** Mention de fin (pros par défaut). */
  disclaimer?: string;
  /** Sections ajoutées avant la mention de fin (ex. « Quand appeler un pro »). */
  children?: ReactNode;
}) {
  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SheetTrustBadge trust={trust} />
          {badges}
          {sheet.duration ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3.5" aria-hidden /> {sheet.duration}
            </span>
          ) : null}
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{sheet.title}</h1>
        <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">{sheet.summary}</p>
        {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
        {trust.kind === "verified" ? (
          <p className="text-sm text-success">
            Relue{trust.reviewerName ? ` par ${trust.reviewerName}` : ""} le {formatDate(trust.reviewedAt)}.
          </p>
        ) : null}
      </header>

      {trust.kind === "ai" ? (
        <div className="flex gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <p>
            Cette fiche a été rédigée automatiquement par l&apos;IA et <strong>n&apos;a été relue par personne</strong>.
            Elle peut contenir des erreurs : contrôlez chaque valeur (sections, distances, pressions) dans la norme ou la
            notice avant de l&apos;appliquer.
          </p>
        </div>
      ) : null}

      {sheet.safety.length > 0 ? (
        <Section icon={<ShieldAlert className="size-5 text-destructive" aria-hidden />} title="Sécurité avant de commencer">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <BulletList items={sheet.safety} />
          </div>
        </Section>
      ) : null}

      {sheet.tools.length > 0 || sheet.materials.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2">
          {sheet.tools.length > 0 ? (
            <Section icon={<Wrench className="size-5 text-primary" aria-hidden />} title="Outillage">
              <BulletList items={sheet.tools} />
            </Section>
          ) : null}
          {sheet.materials.length > 0 ? (
            <Section icon={<Package className="size-5 text-primary" aria-hidden />} title="Matériel et fournitures">
              <BulletList items={sheet.materials} />
            </Section>
          ) : null}
        </div>
      ) : null}

      <Section icon={<HardHat className="size-5 text-primary" aria-hidden />} title="Étapes">
        <ol className="space-y-4">
          {sheet.steps.map((step, index) => (
            <li key={index} className="break-inside-avoid rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <h3 className="pt-1 font-semibold">{step.title}</h3>
                  <BulletList items={step.details} />
                  {step.warning ? (
                    <p className="flex gap-2 rounded-xl bg-warning/10 p-3 text-sm">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                      <span>{step.warning}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {sheet.checks.length > 0 ? (
        <Section icon={<CheckCircle2 className="size-5 text-success" aria-hidden />} title="Contrôles de fin de travaux">
          <ul className="space-y-2 text-sm">
            {sheet.checks.map((check, index) => (
              <li key={index} className="flex gap-2">
                <span className="mt-0.5 size-4 shrink-0 rounded border border-foreground/40" aria-hidden />
                <span>{check}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {sheet.norms.length > 0 ? (
        <Section icon={<BookMarked className="size-5 text-primary" aria-hidden />} title="Textes de référence">
          <ul className="space-y-1.5 text-sm">
            {sheet.norms.map((norm, index) => (
              <li key={index}>
                <span className="font-medium">{norm.ref}</span>
                {norm.label ? <span className="text-muted-foreground"> — {norm.label}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {children}

      <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">{disclaimer}</p>
    </article>
  );
}
