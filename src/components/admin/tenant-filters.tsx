"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUBSCRIPTION_PLANS } from "@/lib/billing/subscription-plans";

export function TenantFilters({
  q,
  accountStatus,
  subscriptionPlan,
}: {
  q: string;
  accountStatus: string;
  subscriptionPlan: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(accountStatus);
  const [plan, setPlan] = useState(subscriptionPlan);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    const nextQ = String(fd.get("q") ?? "").trim();
    if (nextQ) params.set("q", nextQ);
    if (status !== "all") params.set("status", status);
    if (plan !== "all") params.set("plan", plan);
    router.push(`/admin/tenants?${params.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="q">Recherche</Label>
        <Input id="q" name="q" defaultValue={q} placeholder="Nom, e-mail, SIRET…" />
      </div>
      <div className="space-y-2">
        <Label>Statut compte</Label>
        <Select value={status} onValueChange={(value) => setStatus(value ?? "all")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="active">Actif</SelectItem>
            <SelectItem value="suspended">Suspendu</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Formule</Label>
        <Select value={plan} onValueChange={(value) => setPlan(value ?? "all")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            {SUBSCRIPTION_PLANS.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end sm:col-span-2 lg:col-span-4">
        <Button type="submit">Filtrer</Button>
      </div>
    </form>
  );
}
