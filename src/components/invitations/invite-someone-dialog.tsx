"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createPlatformInvitation, type PlatformAccountType } from "@/lib/invitations/actions";

type Props = {
  /** Libellé court selon l’espace (artisan / client) */
  contextLabel: string;
  /** L’artisan peut lier l’invitation client à son activité */
  canLinkClientToArtisan?: boolean;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
};

export function InviteSomeoneDialog({
  contextLabel,
  canLinkClientToArtisan = false,
  variant = "outline",
  size = "sm",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState<PlatformAccountType>("client");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetResult() {
    setInviteUrl(null);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    fd.set("account_type", accountType);

    const res = await createPlatformInvitation(fd);
    setLoading(false);

    if (!res.ok) {
      const msg =
        res.error === "invalid_email"
          ? "Adresse e-mail invalide."
          : "Impossible de créer l’invitation. Vérifie que la migration d’invitations est bien appliquée.";
      setError(msg);
      return;
    }

    setInviteUrl(res.inviteUrl);
    if (res.reused) {
      toast.info("Invitation déjà en attente — lien réutilisé.");
    } else {
      toast.success("Lien d’invitation prêt à être partagé.");
    }
  }

  async function copyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Lien copié");
    } catch {
      toast.error("Copie impossible");
    }
  }

  const typeLabel = accountType === "client" ? "compte client" : "compte artisan (pro)";
  const mailto = inviteUrl
    ? `mailto:?subject=${encodeURIComponent(`Invitation Soline — ${typeLabel}`)}&body=${encodeURIComponent(
        `Bonjour,\n\n${contextLabel} vous invite à rejoindre Soline en tant que ${accountType === "client" ? "client" : "artisan professionnel"} :\n\n${inviteUrl}\n`,
      )}`
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          resetResult();
          setAccountType("client");
        }
      }}
    >
      <DialogTrigger
        className={cn(buttonVariants({ variant, size, className }), "gap-1.5")}
      >
        <UserPlus className="h-4 w-4" />
        Inviter
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inviter sur la plateforme</DialogTitle>
          <DialogDescription>
            Choisissez le type de compte, puis partagez le lien par email ou message.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2 rounded-xl border p-1">
            <button
              type="button"
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                accountType === "client"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
              onClick={() => {
                setAccountType("client");
                resetResult();
              }}
            >
              Client
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                accountType === "artisan"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
              onClick={() => {
                setAccountType("artisan");
                resetResult();
              }}
            >
              Artisan
            </button>
          </div>

          {accountType === "client" && canLinkClientToArtisan && (
            <p className="text-xs text-muted-foreground">
              Le client sera automatiquement relié à ton activité après inscription.
            </p>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Erreur</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite_name">Nom (optionnel)</Label>
              <Input id="invite_name" name="invited_name" placeholder="Prénom ou raison sociale" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite_email">Adresse e-mail</Label>
              <Input id="invite_email" name="email" type="email" required placeholder="personne@exemple.fr" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Génération…" : "Générer le lien"}
            </Button>
          </form>

          {inviteUrl && (
            <Alert>
              <AlertTitle>Lien — inscription {typeLabel}</AlertTitle>
              <AlertDescription className="space-y-3">
                <p className="break-all text-sm">{inviteUrl}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={copyLink}>
                    Copier
                  </Button>
                  {mailto && (
                    <a href={mailto} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                      Messagerie
                    </a>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
