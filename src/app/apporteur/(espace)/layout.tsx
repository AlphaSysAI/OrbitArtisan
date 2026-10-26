import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Handshake, LogOut } from "lucide-react";

import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentReferrer } from "@/lib/referrers/current";

export const metadata: Metadata = { title: "Espace apporteur — Soline", robots: { index: false } };

export default async function ReferrerSpaceLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/apporteur")}`);
  const referrer = await getCurrentReferrer();
  if (!referrer) redirect("/app");

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
              <Handshake className="size-4" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">{referrer.business_name}</p>
              <p className="text-xs text-muted-foreground">Espace apporteur d’affaires</p>
            </div>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {referrer.status === "suspended" ? (
          <div className="rounded-2xl border bg-card p-6 text-sm">
            <p className="font-semibold">Accès suspendu</p>
            <p className="mt-1 text-muted-foreground">Ton espace apporteur est suspendu. Contacte l’équipe Soline.</p>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
