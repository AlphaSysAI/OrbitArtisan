"use client";

import { Loader2, Printer, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { deleteAiSheetAction, generateTechnicalSheetAction } from "@/app/app/fiches/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function PrintSheetButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer aria-hidden /> Imprimer
    </Button>
  );
}

export function DeleteAiSheetButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="print:hidden"
      onClick={() => {
        if (!window.confirm("Supprimer cette fiche générée ?")) return;
        startTransition(async () => {
          const res = await deleteAiSheetAction(id);
          if (!res.ok) {
            toast.error("Suppression impossible.");
            return;
          }
          router.push("/app/fiches");
        });
      }}
    >
      <Trash2 aria-hidden /> Supprimer
    </Button>
  );
}

/** Demande d'une fiche à l'IA quand la bibliothèque ne couvre pas le sujet. */
export function GenerateSheetForm({ initialRequest = "" }: { initialRequest?: string }) {
  const router = useRouter();
  const [request, setRequest] = React.useState(initialRequest);
  const [pending, startTransition] = React.useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const res = await generateTechnicalSheetAction(request);
          if (!res.ok) {
            toast.error(res.message);
            return;
          }
          router.push(`/app/fiches/ia/${res.id}`);
        });
      }}
    >
      <Textarea
        value={request}
        onChange={(event) => setRequest(event.target.value)}
        placeholder="Ex. : poser une fenêtre de toit dans une couverture en ardoise"
        maxLength={300}
        rows={2}
        disabled={pending}
        aria-label="Travail pour lequel générer une fiche"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || request.trim().length < 5}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {pending ? "Rédaction en cours (jusqu'à une minute)…" : "Générer la fiche"}
        </Button>
        <p className="text-xs text-muted-foreground">10 fiches par jour. Elles restent marquées « non vérifiée ».</p>
      </div>
    </form>
  );
}
