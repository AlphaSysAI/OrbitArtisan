"use client";

import { useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ButtonProps = React.ComponentProps<typeof Button>;

/**
 * Bouton d'action admin avec confirmation : obligatoire pour tout ce qui est destructif,
 * payant, irréversible ou qui prévient un tiers (SMS, e-mail).
 */
export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  variant,
  size = "sm",
  className,
  disabled,
}: {
  children: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Renvoie false pour garder la fenêtre ouverte (échec affiché par l'appelant). */
  onConfirm: () => Promise<boolean | void>;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant ?? (destructive ? "destructive" : "outline")}
        className={className}
        disabled={disabled || pending}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{title}</DialogTitle>
            <DialogDescription className="text-left leading-relaxed">{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              type="button"
              variant={destructive ? "destructive" : "default"}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await onConfirm();
                  if (result !== false) setOpen(false);
                })
              }
            >
              {pending ? "En cours…" : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
