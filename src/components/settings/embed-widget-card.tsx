"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { setLeadMatchingEnabled } from "@/app/app/reglages/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmbedWidgetCard({
  slug,
  snippet,
  previewUrl,
  matchingEnabled,
}: {
  slug: string;
  snippet: string;
  previewUrl: string;
  matchingEnabled: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const [enabled, setEnabled] = React.useState(matchingEnabled);
  const [pending, startTransition] = React.useTransition();

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copie impossible. Sélectionne le code à la main.");
    }
  }

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const res = await setLeadMatchingEnabled(next);
      if (!res.ok) {
        setEnabled(!next);
        toast.error("Le réglage n’a pas pu être enregistré.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Recevoir des demandes d’estimation</p>
            <p className="text-sm text-muted-foreground">
              Ton widget et les recherches de clients ne te proposent que si c’est activé.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={toggle}
            disabled={pending}
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60",
              enabled ? "bg-primary" : "bg-muted-foreground/30",
            )}
          >
            <span
              className={cn(
                "absolute top-1 size-5 rounded-full bg-white shadow transition-all",
                enabled ? "left-6" : "left-1",
              )}
            />
          </button>
        </div>
        {pending && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Enregistrement…
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold">Ton code à coller</p>
          <p className="text-sm text-muted-foreground">
            Colle cette ligne juste avant la balise <code>&lt;/body&gt;</code> de ton site (WordPress,
            Wix, Shopify, site fait main…). Un bouton « Estimer mes travaux » apparaîtra en bas à
            droite.
          </p>
        </div>

        <pre className="overflow-x-auto rounded-xl border bg-muted/50 p-4 text-xs leading-relaxed">
          <code>{snippet}</code>
        </pre>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void copy()} className="gap-2">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copié" : "Copier le code"}
          </Button>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Prévisualiser
            <ExternalLink className="size-4" />
          </a>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Options</p>
        <ul className="space-y-1">
          <li>
            <code>data-theme=&quot;light|dark|auto&quot;</code> — thème du widget.
          </li>
          <li>
            <code>data-position=&quot;left&quot;</code> — bouton à gauche.
          </li>
          <li>
            <code>data-label=&quot;Devis en 2 min&quot;</code> — texte du bouton.
          </li>
          <li>
            <code>data-color=&quot;#1b2735&quot;</code> — couleur du bouton.
          </li>
          <li>
            <code>data-button=&quot;false&quot;</code> — pas de bouton, tu l’ouvres toi-même avec{" "}
            <code>Soline.open()</code>.
          </li>
        </ul>
        <p className="pt-1">
          Sans widget, partage simplement le lien{" "}
          <code>
            /estimation?artisan={slug}
          </code>{" "}
          (QR code, réseaux sociaux, e-mail).
        </p>
      </div>
    </div>
  );
}
