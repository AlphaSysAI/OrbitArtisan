"use client";

import { useState } from "react";
import { Loader2, Sparkles, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { QuoteEditorOutcome } from "@/lib/ai/quote-editor-bridge";

/**
 * « Modifier avec l'IA » : consigne courte → seules les lignes visées changent.
 * Pensé chantier : une phrase, un bouton, résultat lisible et annulable.
 */
export function QuoteAiEditBar({
  onEdit,
  canUndo,
  onUndo,
}: {
  onEdit: (instruction: string) => Promise<QuoteEditorOutcome>;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<QuoteEditorOutcome | null>(null);

  async function submit() {
    const text = instruction.trim();
    if (text.length < 3 || pending) return;
    setPending(true);
    setResult(null);
    const res = await onEdit(text);
    setResult(res);
    if (res.ok && res.changes.length) setInstruction("");
    setPending(false);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-brand/30 bg-brand/5 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-brand" />
        <p className="text-sm font-semibold">Modifier avec l’IA</p>
        <p className="text-xs text-muted-foreground">Seules les lignes citées changent, le reste est conservé.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={2}
          maxLength={1500}
          placeholder="Ex. : passe les tuiles à 450, retire l’écran sous-toiture, ajoute 12 closoirs ventilés, compte 6 h de plus"
          className="min-h-[2.75rem] flex-1 bg-background"
          disabled={pending}
        />
        <div className="flex gap-2 sm:flex-col">
          <Button type="button" onClick={() => void submit()} disabled={pending || instruction.trim().length < 3} className="h-11 flex-1">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Appliquer
          </Button>
          {canUndo ? (
            <Button type="button" variant="outline" onClick={onUndo} disabled={pending} className="h-11 flex-1">
              <Undo2 className="size-4" />
              Annuler
            </Button>
          ) : null}
        </div>
      </div>
      {result ? (
        result.ok ? (
          <div className="space-y-1 text-sm">
            {result.changes.length ? (
              <ul className="space-y-0.5">
                {result.changes.map((c) => (
                  <li key={c} className="font-medium">
                    {c}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Aucune modification appliquée.</p>
            )}
            {result.warnings.length ? (
              <ul className="list-inside list-disc text-xs text-muted-foreground">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-destructive">{result.message}</p>
        )
      ) : null}
    </section>
  );
}
