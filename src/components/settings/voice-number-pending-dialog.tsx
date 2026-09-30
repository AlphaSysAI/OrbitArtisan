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
            Votre numéro Soline arrive
          </DialogTitle>
          <DialogDescription className="text-left leading-relaxed">
            Nous activons votre ligne dédiée : cela prend en général quelques minutes, au plus{" "}
            <strong className="text-foreground">24 h</strong> en cas de souci technique (nous sommes
            alertés automatiquement). Votre numéro apparaîtra dans Réglages → IA Vocale.
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
