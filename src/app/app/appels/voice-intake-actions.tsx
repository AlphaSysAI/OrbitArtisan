"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Archive, ArchiveRestore, Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

import { archiveVoiceIntake, dismissVoiceIntake, restoreVoiceIntake, validateVoiceIntakeQuote } from "./actions";

export function VoiceIntakeActions({
  intakeId,
  canValidate,
}: {
  intakeId: string;
  canValidate: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"validate" | "dismiss" | null>(null);
  const [vatRate, setVatRate] = React.useState("20");

  async function handleValidate() {
    setPending("validate");
    const res = await validateVoiceIntakeQuote(intakeId, Number(vatRate));
    setPending(null);

    if (!res.ok) {
      toast.error(res.hint ?? "Impossible de valider ce devis.", {
        description: res.error,
      });
      return;
    }

    if (!res.emailSent) {
      toast.warning("Devis créé, mais l'email n'a pas pu être envoyé.", {
        description: "Vérifie RESEND_API_KEY ou renvoie le lien depuis la fiche devis.",
      });
    } else {
      toast.success("Devis envoyé au client par email.");
    }

    router.refresh();
  }

  async function handleDismiss() {
    setPending("dismiss");
    const res = await dismissVoiceIntake(intakeId);
    setPending(null);
    if (!res.ok) {
      toast.error("Impossible de classer cet appel.");
      return;
    }
    toast.message("Appel classé sans suite.", { description: "Retrouvable dans l'onglet Archivés." });
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/app/quotes/new?voiceIntakeId=${intakeId}&aiDraft=1`}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
      >
        <Pencil className="size-3.5" />
        Éditer
      </Link>
      {canValidate ? (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          TVA
          <select
            value={vatRate}
            onChange={(e) => setVatRate(e.target.value)}
            disabled={pending !== null}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none"
          >
            <option value="20">20 % (normal)</option>
            <option value="10">10 % (rénovation)</option>
            <option value="5.5">5,5 % (rénov. énergie)</option>
          </select>
        </label>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="gap-1.5"
        disabled={!canValidate || pending !== null}
        onClick={() => void handleValidate()}
      >
        {pending === "validate" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        Valider et envoyer
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        disabled={pending !== null}
        onClick={() => void handleDismiss()}
      >
        {pending === "dismiss" ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
        Classer sans suite
      </Button>
    </div>
  );
}

/** Ranger (onglet Devis) ou sortir des archives. */
export function VoiceIntakeArchiveButton({ intakeId, mode }: { intakeId: string; mode: "archive" | "restore" }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    setPending(true);
    const res = mode === "archive" ? await archiveVoiceIntake(intakeId) : await restoreVoiceIntake(intakeId);
    setPending(false);
    if (!res.ok) {
      toast.error(mode === "archive" ? "Impossible d'archiver cet appel." : "Impossible de restaurer cet appel.");
      return;
    }
    toast.message(mode === "archive" ? "Appel archivé." : "Appel restauré.");
    router.refresh();
  }

  const Icon = mode === "archive" ? Archive : ArchiveRestore;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-1.5 text-muted-foreground"
      disabled={pending}
      onClick={() => void handleClick()}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
      {mode === "archive" ? "Archiver" : "Restaurer"}
    </Button>
  );
}
