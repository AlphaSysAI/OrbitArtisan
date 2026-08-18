import Link from "next/link";

import { ShieldX } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";

export default function AdminForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <ShieldX className="size-7" />
      </span>
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Accès refusé</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Cet espace est réservé aux comptes Super Admin Soline. Contactez l&apos;équipe plateforme si vous pensez
          qu&apos;il s&apos;agit d&apos;une erreur.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/app" className={buttonVariants({ variant: "default" })}>
          Espace pro
        </Link>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Accueil
        </Link>
      </div>
    </div>
  );
}
