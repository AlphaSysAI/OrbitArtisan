"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Merge, Pencil, Send, SplitSquareHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { detachToNewClient, mergeClientsAction, sendClientMessage, updateClient } from "../actions";
import { CLIENT_FORM_ERRORS, ClientContactFields, type ClientContactDefaults } from "../client-contact-form";

export function EditClientDialog({ clientId, defaults }: { clientId: string; defaults: ClientContactDefaults }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const res = await updateClient(clientId, new FormData(e.currentTarget));
    setPending(false);
    if (!res.ok) return void toast.error(CLIENT_FORM_ERRORS[res.error] ?? "Enregistrement impossible.");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" /> Modifier
      </Button>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Coordonnées du client</DialogTitle>
            <DialogDescription>Utilisées pour tes prochains devis, rappels et messages.</DialogDescription>
          </DialogHeader>
          <ClientContactFields defaults={defaults} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ClientComposer({
  clientId,
  channel,
}: {
  clientId: string;
  channel: "account" | "email" | "none";
}) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [pending, setPending] = React.useState(false);

  if (channel === "none") {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Ce client n&apos;a ni compte ni e-mail : appelle-le ou envoie-lui un SMS. Ajoute son e-mail (Modifier) pour lui
        écrire d&apos;ici.
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await sendClientMessage(clientId, text);
    setPending(false);
    if (!res.ok) return void toast.error("Message non envoyé. Réessaie.");
    setText("");
    toast.success(channel === "email" ? "Envoyé par e-mail au client." : "Message envoyé.");
    router.refresh();
  }

  return (
    <form id="message" onSubmit={(e) => void onSubmit(e)} className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={8000}
        placeholder={channel === "email" ? "Écrire au client (envoyé par e-mail)…" : "Écrire au client…"}
        className="w-full rounded-xl border bg-background p-3 text-base"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {channel === "email"
            ? "Pas de compte : il reçoit ton message par e-mail et peut te répondre."
            : "Il reçoit une notification dans son espace Soline."}
        </p>
        <Button type="submit" disabled={pending || text.trim().length === 0} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Envoyer
        </Button>
      </div>
    </form>
  );
}

export function DetachItemButton({
  clientId,
  table,
  itemId,
}: {
  clientId: string;
  table: "quotes" | "voice_call_intakes" | "appointments";
  itemId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await detachToNewClient(clientId, table, itemId, name);
    setPending(false);
    if (!res.ok) return void toast.error("Déplacement impossible.");
    setOpen(false);
    toast.success("Élément déplacé vers une nouvelle fiche.");
    if (res.id) router.push(`/app/clients/${res.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
        Pas ce client ?
      </button>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SplitSquareHorizontal className="size-4" /> Séparer vers une nouvelle fiche
            </DialogTitle>
            <DialogDescription>
              Soline a rattaché cet élément à ce client (même numéro ou même e-mail). S&apos;il s&apos;agit de quelqu&apos;un
              d&apos;autre, il sera déplacé vers une nouvelle fiche.
            </DialogDescription>
          </DialogHeader>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            placeholder="Nom de l'autre client"
            className="h-11 w-full rounded-md border bg-background px-3 text-base"
          />
          <DialogFooter>
            <Button type="submit" disabled={pending || name.trim().length < 2}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Créer la fiche et déplacer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MergeClientDialog({
  clientId,
  clientName,
  candidates,
}: {
  clientId: string;
  clientName: string;
  candidates: { id: string; name: string; hint: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const shown = candidates
    .filter((c) => `${c.name} ${c.hint}`.toLowerCase().includes(filter.trim().toLowerCase()))
    .slice(0, 30);

  async function onMerge() {
    if (!selected) return;
    setPending(true);
    const res = await mergeClientsAction(clientId, selected);
    setPending(false);
    if (!res.ok) {
      return void toast.error(
        res.error === "conflicting_accounts"
          ? "Ces deux fiches sont liées à deux comptes Soline différents : ce sont deux personnes distinctes."
          : "Fusion impossible.",
      );
    }
    setOpen(false);
    toast.success("Fiches fusionnées.");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setOpen(true)}>
        <Merge className="size-3.5" /> Fusionner un doublon
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fusionner avec {clientName}</DialogTitle>
          <DialogDescription>
            Choisis la fiche en double : tout son historique rejoint celle-ci, puis elle est supprimée. Les factures
            déjà émises ne sont pas modifiées.
          </DialogDescription>
        </DialogHeader>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Rechercher…"
          className="h-10 w-full rounded-md border bg-background px-3 text-base"
        />
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {shown.map((c) => (
            <li key={c.id}>
              <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm ${selected === c.id ? "border-foreground" : ""}`}>
                <input type="radio" name="merge" checked={selected === c.id} onChange={() => setSelected(c.id)} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.hint}</span>
                </span>
              </label>
            </li>
          ))}
          {!shown.length ? <li className="p-2 text-sm text-muted-foreground">Aucune autre fiche.</li> : null}
        </ul>
        <DialogFooter>
          <Button type="button" disabled={!selected || pending} onClick={() => void onMerge()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null} Fusionner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
