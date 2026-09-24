"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function VoiceNumberPendingDialog({ defaultOpen }: { defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  if (!defaultOpen) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg">
            <Sparkles className="size-5 text-primary" />
            Soline arrive très bientôt
          </DialogTitle>
          <DialogDescription className="text-left leading-relaxed">
            Victime de son succès, nous finalisons l&apos;attribution de votre ligne dédiée. Votre
            secrétaire IA Soline sera disponible pour vous{" "}
            <strong className="text-foreground">sous 24 h</strong>. Vous recevrez votre numéro
            directement dans Réglages → IA Vocale.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <Button type="button" onClick={() => setOpen(false)}>
            J&apos;ai compris
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
