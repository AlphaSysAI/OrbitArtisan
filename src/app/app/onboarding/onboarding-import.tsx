"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, Check, CheckCircle2, FileUp, Loader2, Pencil, RotateCcw, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ImportReview } from "@/lib/onboarding/import-quotes";
import type { CatalogCandidate, VerifiedDocument } from "@/lib/onboarding/verify-extraction";
import { cn } from "@/lib/utils";

import { analyzeQuoteFileAction, buildImportReviewAction, saveImportAction } from "./import-actions";
import { formatCents } from "@/lib/format/money";

type FieldKey = keyof ImportReview["fields"];

/** Champs exigés pour activer le compte, dans l'ordre où on les demande. */
const REQUIRED: { key: FieldKey; label: string; hint: string; inputMode?: "numeric" | "tel" | "email" | "url"; placeholder?: string }[] = [
  { key: "siret", label: "SIRET", hint: "14 chiffres, en bas de ton devis ou sur ton Kbis.", inputMode: "numeric" },
  { key: "business_name", label: "Nom de l'entreprise", hint: "Tel qu'il doit apparaître sur tes devis." },
  { key: "first_name", label: "Ton prénom", hint: "Pour personnaliser Soline." },
  { key: "last_name", label: "Ton nom", hint: "Pour personnaliser Soline." },
  { key: "phone", label: "Téléphone pro", hint: "Affiché sur tes devis.", inputMode: "tel" },
  { key: "address_line1", label: "Adresse de l'entreprise", hint: "Numéro et rue." },
  { key: "postal_code", label: "Code postal", hint: "", inputMode: "numeric" },
  { key: "city", label: "Ville", hint: "" },
  { key: "vat_number", label: "N° de TVA intracommunautaire", hint: "Format FR + 11 caractères.", placeholder: "FR12345678901" },
  { key: "trade_register", label: "RCS ou RM", hint: "Ex. « RM 123 456 789 Aude » ou « RCS Carcassonne 123 456 789 »." },
  { key: "decennale_insurer", label: "Assureur décennale", hint: "Nom de la compagnie sur ton attestation." },
  { key: "decennale_policy_number", label: "N° de contrat décennale", hint: "Sur ton attestation d'assurance." },
  { key: "decennale_coverage_area", label: "Couverture géographique décennale", hint: "Mention obligatoire.", placeholder: "France métropolitaine" },
  { key: "rc_pro_insurer", label: "Assureur RC Pro", hint: "Souvent le même que la décennale." },
  { key: "rc_pro_number", label: "N° de contrat RC Pro", hint: "Sur ton attestation d'assurance." },
  { key: "mediator_name", label: "Médiateur de la consommation", hint: "Obligatoire pour les particuliers. Souvent fourni par ta fédération (CAPEB, FFB…)." },
  { key: "mediator_url", label: "Site du médiateur", hint: "Adresse web du médiateur.", inputMode: "url" },
  { key: "payment_terms_days", label: "Délai de paiement (jours)", hint: "Délai après facture. 30 jours est l'usage.", inputMode: "numeric", placeholder: "30" },
];

const REASON: Record<string, string> = {
  missing: "Absent de tes devis",
  unreadable: "Illisible ou pas assez net pour être certain",
  invalid: "Format incorrect sur le document",
  conflict: "Deux valeurs différentes selon tes devis",
};

const SOURCE: Record<string, string> = {
  document: "lu sur tes devis",
  registry: "registre officiel",
  computed: "calculé depuis ton SIREN",
};

const ANALYZE_ERRORS: Record<string, string> = {
  too_large: "Fichier trop lourd (4 Mo max). Reprends la photo ou exporte le PDF en qualité standard.",
  unsupported_file: "Format non reconnu : photo (JPEG/PNG) ou PDF.",
  rate_limited: "Trop d'analyses aujourd'hui. Réessaie demain ou saisis à la main.",
  analysis_failed: "Analyse impossible (réseau ?). Réessaie.",
  auth: "Session expirée : reconnecte-toi.",
};

type Slot = { id: string; name: string; state: "analyzing" | "done" | "error"; error?: string; doc?: VerifiedDocument; file: File };

/** Photo → JPEG ≤ 2000 px : lisible pour l'OCR et léger à envoyer en 4G. */
async function prepare(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = rej;
      el.src = url;
    });
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], "devis.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function eur(cents: number | null) {
  return cents === null ? "prix ?" : formatCents(cents);
}

export function OnboardingImport({ existing }: { existing: Partial<Record<FieldKey | "vat_regime", string>> }) {
  const router = useRouter();
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [review, setReview] = React.useState<ImportReview | null>(null);
  const [building, setBuilding] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const cameraInput = React.useRef<HTMLInputElement>(null);

  async function analyze(slot: Slot) {
    setSlots((s) => s.map((x) => (x.id === slot.id ? { ...x, state: "analyzing", error: undefined } : x)));
    const fd = new FormData();
    fd.set("file", await prepare(slot.file));
    const res = await analyzeQuoteFileAction(fd);
    setSlots((s) =>
      s.map((x) =>
        x.id === slot.id
          ? res.ok
            ? { ...x, state: "done", doc: res.doc }
            : { ...x, state: "error", error: ANALYZE_ERRORS[res.error] ?? "Erreur." }
          : x,
      ),
    );
  }

  function onPick(files: FileList | null) {
    if (!files?.length) return;
    const room = 3 - slots.length;
    const added = [...files].slice(0, room).map((file) => ({ id: crypto.randomUUID(), name: file.name, state: "analyzing" as const, file }));
    setSlots((s) => [...s, ...added]);
    for (const slot of added) void analyze(slot);
  }

  async function onBuild() {
    const docs = slots.filter((s) => s.state === "done" && s.doc).map((s) => s.doc!);
    if (!docs.length) return;
    setBuilding(true);
    const res = await buildImportReviewAction(docs);
    setBuilding(false);
    if (res.ok) setReview(res.review);
  }

  if (review) return <ImportReviewPanel review={review} existing={existing} onDone={() => router.push("/app?bienvenue=1")} />;

  const analyzing = slots.some((s) => s.state === "analyzing");
  const ready = slots.filter((s) => s.state === "done").length;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Montre-nous 2 ou 3 anciens devis</h2>
        <p className="text-sm text-muted-foreground">
          Soline y lit tes mentions légales, ton assurance et tes prix. Tu ne saisis que ce qui manque. Les fichiers ne
          sont pas conservés.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={slots.length >= 3}
          onClick={() => cameraInput.current?.click()}
          className="flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-semibold disabled:opacity-40"
        >
          <Camera className="size-6" /> Prendre en photo
        </button>
        <button
          type="button"
          disabled={slots.length >= 3}
          onClick={() => fileInput.current?.click()}
          className="flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-semibold disabled:opacity-40"
        >
          <FileUp className="size-6" /> Choisir un PDF
        </button>
      </div>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPick(e.target.files); e.target.value = ""; }} />
      <input ref={fileInput} type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={(e) => { onPick(e.target.files); e.target.value = ""; }} />

      {slots.length ? (
        <ul className="space-y-2">
          {slots.map((s, i) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm">
              {s.state === "analyzing" ? <Loader2 className="size-4 animate-spin" /> : s.state === "done" ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertTriangle className="size-4 text-amber-600" />}
              <span className="min-w-0 flex-1 truncate">
                Devis {i + 1}
                {s.state === "analyzing" ? " — lecture en cours…" : s.state === "done" ? (s.doc?.readable ? " — lu" : " — pas reconnu comme un devis") : ` — ${s.error}`}
              </span>
              {s.state === "error" ? (
                <button type="button" onClick={() => void analyze(s)} aria-label="Réessayer" className="p-1">
                  <RotateCcw className="size-4" />
                </button>
              ) : null}
              <button type="button" onClick={() => setSlots((x) => x.filter((y) => y.id !== s.id))} aria-label="Retirer" className="p-1 text-muted-foreground">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Button type="button" size="lg" className="h-12 w-full" disabled={!ready || analyzing || building} onClick={() => void onBuild()}>
        {building ? <Loader2 className="size-4 animate-spin" /> : null}
        {analyzing ? "Lecture en cours…" : ready ? `Continuer avec ${ready} devis` : "Ajoute au moins un devis"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Pas de devis sous la main ?{" "}
        <Link href="/app/onboarding?step=1" className="font-medium underline underline-offset-4">
          Saisir à la main
        </Link>
      </p>
    </div>
  );
}

function ImportReviewPanel({
  review,
  existing,
  onDone,
}: {
  review: ImportReview;
  existing: Partial<Record<FieldKey | "vat_regime", string>>;
  onDone: () => void;
}) {
  // Déjà connu du profil (inscription) : jamais redemandé.
  const known = (k: FieldKey) => review.fields[k].status === "verified" || Boolean(existing[k]?.trim());
  const initial = Object.fromEntries(
    Object.entries(review.fields).map(([k, f]) => [
      k,
      f.status === "verified" ? (f.value ?? "") : (existing[k as FieldKey]?.trim() ?? ""),
    ]),
  ) as Record<FieldKey, string>;
  const [values, setValues] = React.useState<Record<FieldKey, string>>(initial);
  const [editing, setEditing] = React.useState<Set<FieldKey>>(new Set());
  const [lines, setLines] = React.useState<CatalogCandidate[]>(review.lines);
  const [vatRegime, setVatRegime] = React.useState<"normal" | "franchise" | null>(
    review.vatRegime.value ?? ((existing.vat_regime as "normal" | "franchise" | undefined) || null),
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null);

  // N° de TVA exigé seulement si l'entreprise facture la TVA (hors franchise 293 B).
  const applicable = REQUIRED.filter((r) => r.key !== "vat_number" || vatRegime === "normal");
  const toAsk = applicable.filter((r) => !known(r.key));
  const verified = applicable.filter((r) => known(r.key));
  const remaining = toAsk.filter((r) => !values[r.key]?.trim()).length + (vatRegime ? 0 : 1);

  async function onSave() {
    setSaving(true);
    setError(null);
    const res = await saveImportAction({
      fields: {
        ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim() || null])),
        vat_regime: vatRegime,
        ...(vatRegime === "franchise" ? { vat_number: values.vat_number?.trim() || null } : {}),
      },
      lines: lines.filter((l) => l.selected).map((l) => ({ label: l.label, unit: l.unit as never, unitPriceCents: l.unitPriceCents, vatRate: l.vatRate })),
    });
    setSaving(false);
    if (!res.ok) {
      const label = REQUIRED.find((r) => r.key === res.field || (res.field === "trade_register" && r.key === "trade_register"))?.label;
      setError({ field: res.field, message: label ? `${label} : format invalide, vérifie la saisie.` : "Enregistrement impossible. Réessaie." });
      return;
    }
    if (res.completed) onDone();
    else setError({ message: "Il manque encore quelques informations (voir en rouge)." });
  }

  const input = (r: (typeof REQUIRED)[number], autoFocus = false) => (
    <input
      value={values[r.key]}
      onChange={(e) => setValues((v) => ({ ...v, [r.key]: e.target.value }))}
      inputMode={r.inputMode}
      placeholder={r.placeholder}
      autoFocus={autoFocus}
      className={cn("h-12 w-full rounded-lg border bg-background px-3 text-base", error?.field === r.key && "border-red-500")}
    />
  );

  return (
    <div className="space-y-6 pb-24">
      {review.registry ? (
        <div className={cn("flex items-start gap-3 rounded-2xl p-4 text-sm", review.registry.active ? "bg-emerald-500/10" : "bg-red-500/10")}>
          <ShieldCheck className="mt-0.5 size-5 shrink-0" />
          <p>
            <strong>{review.registry.name}</strong>{" "}
            {review.registry.active ? "— entreprise vérifiée au registre officiel." : "— attention : entreprise indiquée comme cessée au registre."}
          </p>
        </div>
      ) : null}

      <section
        className={cn(
          "space-y-3 rounded-2xl border p-4",
          vatRegime ? "border-emerald-500/40" : "border-amber-500/50 bg-amber-500/5",
        )}
      >
        <div>
          <p className="font-medium">Tes devis sont-ils avec TVA ?</p>
          <p className="text-xs text-muted-foreground">
            {review.vatRegime.reason === "document" && vatRegime === review.vatRegime.value
              ? vatRegime === "franchise"
                ? "Mention « TVA non applicable, art. 293 B du CGI » trouvée sur tes devis."
                : "TVA facturée sur tes devis."
              : review.vatRegime.reason === "conflict"
                ? "Tes devis ne disent pas la même chose : lequel est à jour ?"
                : "Pas lisible sur tes devis."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["normal", "Oui, je facture la TVA"],
              ["franchise", "Non, franchise (293 B)"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setVatRegime(value)}
              className={cn(
                "min-h-12 rounded-xl border px-3 text-sm font-medium",
                vatRegime === value && "border-foreground bg-foreground text-background",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {vatRegime === "franchise" ? (
          <p className="text-xs text-muted-foreground">
            Tes devis et factures porteront « TVA non applicable, art. 293 B du CGI », sans TVA. Si tu dépasses le seuil de
            franchise, repasse au régime normal dans Réglages.
          </p>
        ) : null}
      </section>

      {toAsk.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            {remaining ? `Plus que ${remaining} information${remaining > 1 ? "s" : ""} à compléter` : "C'est complet"}
          </h2>
          {toAsk.map((r, i) => {
            const f = review.fields[r.key];
            const done = Boolean(values[r.key]?.trim());
            return (
              <div key={r.key} className={cn("space-y-2 rounded-2xl border p-4", done ? "border-emerald-500/40" : "border-amber-500/50 bg-amber-500/5")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{r.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {REASON[f.status] ?? ""}
                      {r.hint ? ` · ${r.hint}` : ""}
                    </p>
                  </div>
                  {done ? <Check className="size-5 text-emerald-600" /> : null}
                </div>
                {f.status === "conflict" && f.options?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {f.options.map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setValues((v) => ({ ...v, [r.key]: o }))}
                        className={cn("rounded-full border px-3 py-1.5 text-sm", values[r.key] === o && "border-foreground bg-foreground text-background")}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                ) : null}
                {input(r, i === 0)}
              </div>
            );
          })}
        </section>
      ) : null}

      {verified.length ? (
        <details className="rounded-2xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            <CheckCircle2 className="mr-1.5 inline size-4 text-emerald-600" />
            {verified.length} informations vérifiées
          </summary>
          <ul className="mt-3 space-y-2">
            {verified.map((r) => (
              <li key={r.key} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{r.label}</span>
                  <button type="button" onClick={() => setEditing((s) => new Set(s).add(r.key))} aria-label={`Modifier ${r.label}`} className="p-1 text-muted-foreground">
                    <Pencil className="size-3.5" />
                  </button>
                </div>
                {editing.has(r.key) ? (
                  input(r)
                ) : (
                  <p className="font-medium">
                    {values[r.key]}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({review.fields[r.key].status === "verified" ? (SOURCE[review.fields[r.key].source ?? ""] ?? "") : "ton profil"})
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tes prestations ({lines.filter((l) => l.selected).length})</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune ligne de prix lisible. Tu pourras dicter tes premiers devis directement.</p>
        ) : (
          <ul className="divide-y rounded-2xl border">
            {lines.map((l) => (
              <li key={l.key}>
                <label className="flex cursor-pointer items-center gap-3 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={l.selected}
                    onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, selected: e.target.checked } : x)))}
                    className="size-5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {eur(l.unitPriceCents)} {vatRegime === "franchise" ? "net" : "HT"} / {l.unit ?? "U"}
                      {vatRegime === "franchise"
                        ? ""
                        : ` · TVA ${l.vatRate !== null ? `${String(l.vatRate).replace(".", ",")} %` : "à définir"}`}
                      {l.occurrences > 1 ? ` · vu sur ${l.occurrences} devis` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Décoché = prix pas assez lisible pour être repris sans ton accord.</p>
      </section>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error.message}</p> : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
        <Button type="button" size="lg" className="mx-auto flex h-12 w-full max-w-2xl" disabled={saving || remaining > 0} onClick={() => void onSave()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          {remaining > 0 ? `Encore ${remaining} champ${remaining > 1 ? "s" : ""}` : "Activer mon compte"}
        </Button>
      </div>
    </div>
  );
}
