"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { inviteTeamMember, removeTeamMember, revokeTeamInvite } from "@/app/app/reglages/team-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TeamInviteForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await inviteTeamMember(email);
    setPending(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message ?? "Invitation envoyée.");
    setEmail("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="team_invite_email">Adresse e-mail du collaborateur</Label>
        <Input
          id="team_invite_email"
          type="email"
          required
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom@entreprise.fr"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Envoi…" : "Inviter"}
      </Button>
    </form>
  );
}

export function TeamRowAction({ kind, id, label }: { kind: "member" | "invite"; id: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onClick() {
    const question =
      kind === "member"
        ? `Retirer ${label} de l'équipe ? Son accès au compte sera coupé immédiatement.`
        : `Annuler l'invitation envoyée à ${label} ?`;
    if (!window.confirm(question)) return;
    setPending(true);
    const res = kind === "member" ? await removeTeamMember(id) : await revokeTeamInvite(id);
    setPending(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void onClick()}>
      {kind === "member" ? "Retirer" : "Annuler"}
    </Button>
  );
}
