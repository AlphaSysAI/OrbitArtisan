"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { createClientManually } from "./actions";
import { CLIENT_FORM_ERRORS, ClientContactFields } from "./client-contact-form";

export function NewClientDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const res = await createClientManually(new FormData(e.currentTarget));
    setPending(false);
    if (!res.ok) return void toast.error(CLIENT_FORM_ERRORS[res.error] ?? "Création impossible.");
    setOpen(false);
    router.push(`/app/clients/${res.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" size="lg" className="gap-2" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" /> Nouveau client
      </Button>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nouveau client</DialogTitle>
          </DialogHeader>
          <ClientContactFields />
          <p className="text-xs text-muted-foreground">
            Si ce téléphone ou cet e-mail est déjà connu, la fiche existante s&apos;ouvre (pas de doublon).
          </p>
          <DialogFooter>
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Créer la fiche
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
