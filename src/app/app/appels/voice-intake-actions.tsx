"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

import { dismissVoiceIntake, validateVoiceIntakeQuote } from "./actions";

export function VoiceIntakeActions({
  intakeId,
  canValidate,
}: {
  intakeId: string;
  canValidate: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"validate" | "dismiss" | null>(null);

  async function handleValidate() {
    setPending("validate");
    const res = await validateVoiceIntakeQuote(intakeId);
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
      toast.error("Impossible d'ignorer cet appel.");
      return;
    }
    toast.message("Appel archivé.");
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
        Ignorer
      </Button>
    </div>
  );
}
