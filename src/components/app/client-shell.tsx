import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

import { ClientNav } from "./client-nav";
import { signOut } from "@/app/login/actions";

export function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/compte" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground">
              α
            </div>
            <div className="leading-tight">
              <p className="text-base font-semibold tracking-tight">AlphaSys</p>
              <p className="text-xs text-muted-foreground">Espace client</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action={signOut}>
              <Button variant="outline" size="sm" type="submit" className="text-muted-foreground">
                Quitter
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[220px_1fr] lg:gap-10 lg:py-10">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <ClientNav />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
