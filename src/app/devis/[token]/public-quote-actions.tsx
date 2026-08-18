"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { acceptPublicQuote } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PublicQuoteActions({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error("Indique ton nom pour signer.");
      return;
    }
    setPending(true);
    const res = await acceptPublicQuote(token, name.trim());
    setPending(false);
    if (!res.ok) {
      toast.error("Impossible d'accepter le devis.");
      return;
    }
    toast.success("Devis accepté — merci !");
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void handleAccept(e)} className="space-y-4 rounded-2xl border bg-card p-6">
      <p className="text-sm font-medium">Accepter ce devis</p>
      <div className="space-y-2">
        <Label htmlFor="signer">Votre nom</Label>
        <Input id="signer" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom" required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signature…" : "J'accepte le devis"}
      </Button>
    </form>
  );
}
