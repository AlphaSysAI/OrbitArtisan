"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { setSheetReviewAction } from "@/app/admin/(protected)/fiches/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TechnicalSheetReviewControls({
  sheetId,
  status,
  reviewerName,
  note,
}: {
  sheetId: string;
  status: "verified" | "needs_changes" | null;
  reviewerName: string | null;
  note: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(reviewerName ?? "");
  const [comment, setComment] = React.useState(note ?? "");
  const [pending, startTransition] = React.useTransition();

  function save(next: "verified" | "needs_changes" | null) {
    startTransition(async () => {
      const res = await setSheetReviewAction({ sheetId, status: next, reviewerName: name, note: comment });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(next === "verified" ? "Fiche vérifiée." : next === "needs_changes" ? "Fiche retirée de l'app." : "Fiche remise en relecture.");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Relecture
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-xl border bg-muted/30 p-3 sm:w-96">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Relu par (ex. Jean Martin, électricien)" maxLength={120} />
      <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Remarque (facultatif)" maxLength={2000} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => save("verified")}>
          Vérifiée
        </Button>
        <Button size="sm" variant="destructive" disabled={pending} onClick={() => save("needs_changes")}>
          À corriger
        </Button>
        {status ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(null)}>
            Remettre en relecture
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
