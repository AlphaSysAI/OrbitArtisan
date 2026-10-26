"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  cancelReferrerInvitationAction,
  inviteReferrerAction,
  resendReferrerInvitationAction,
  setReferrerStatusAction,
  type InviteResult,
} from "@/app/admin/(protected)/apporteurs/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function copy(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Lien copié");
  } catch {
    toast.message(url);
  }
}

function notifySent(res: Extract<InviteResult, { ok: true }>) {
  if (res.sent) toast.success("Invitation envoyée par e-mail");
  else {
    void copy(res.url);
    toast.warning("E-mail non envoyé : lien copié, transmets-le à la main.");
  }
}

const FIELDS = [
  { name: "email", label: "E-mail", type: "email", autoComplete: "off" },
  { name: "first_name", label: "Prénom", type: "text", autoComplete: "off" },
  { name: "last_name", label: "Nom", type: "text", autoComplete: "off" },
  { name: "siren", label: "SIREN", type: "text", autoComplete: "off" },
] as const;

export function InviteReferrerForm() {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_160px_auto] lg:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const input = Object.fromEntries(FIELDS.map((f) => [f.name, String(new FormData(form).get(f.name) ?? "")]));
        start(async () => {
          const res = await inviteReferrerAction(input);
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            toast.error(res.error);
            return;
          }
          setErrors({});
          form.reset();
          notifySent(res);
        });
      }}
    >
      {FIELDS.map((f) => (
        <div key={f.name} className="space-y-1.5">
          <Label htmlFor={`ref-${f.name}`}>{f.label}</Label>
          <Input
            id={`ref-${f.name}`}
            name={f.name}
            type={f.type}
            autoComplete={f.autoComplete}
            inputMode={f.name === "siren" ? "numeric" : undefined}
            required
          />
          {errors[f.name] ? <p className="text-xs text-destructive">{errors[f.name]}</p> : null}
        </div>
      ))}
      <Button type="submit" disabled={pending}>
        {pending ? "Envoi…" : "Inviter"}
      </Button>
    </form>
  );
}

export function InvitationRowActions({ invitationId }: { invitationId: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await resendReferrerInvitationAction(invitationId);
            if (!res.ok) return void toast.error(res.error);
            notifySent(res);
          })
        }
      >
        Renvoyer
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await cancelReferrerInvitationAction(invitationId);
            if (!res.ok) return void toast.error(res.error ?? "Annulation impossible");
            toast.success("Invitation annulée");
          })
        }
      >
        Annuler
      </Button>
    </div>
  );
}

export function ReferrerStatusButton({ referrerId, status }: { referrerId: string; status: "active" | "suspended" }) {
  const [pending, start] = useTransition();
  const next = status === "active" ? "suspended" : "active";
  return (
    <Button
      size="sm"
      variant={status === "active" ? "ghost" : "outline"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await setReferrerStatusAction(referrerId, next);
          if (!res.ok) return void toast.error(res.error ?? "Mise à jour impossible");
          toast.success(next === "suspended" ? "Accès suspendu" : "Accès réactivé");
        })
      }
    >
      {status === "active" ? "Suspendre" : "Réactiver"}
    </Button>
  );
}
