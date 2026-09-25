"use client";

import { useState, useTransition } from "react";

import { claimPromoCodeAction } from "@/app/app/abonnement/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PromoCodeForm() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setResult(await claimPromoCodeAction(code));
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Label htmlFor="promo_code_settings">Vous avez un code ambassadeur ?</Label>
      <div className="flex gap-2">
        <Input
          id="promo_code_settings"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="AMBASSADEUR"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={32}
          className="max-w-56"
        />
        <Button type="submit" variant="outline" disabled={pending || !code.trim()}>
          {pending ? "Vérification…" : "Appliquer"}
        </Button>
      </div>
      {result ? (
        <p className={result.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{result.message}</p>
      ) : null}
    </form>
  );
}
