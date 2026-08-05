import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import { ClientShell } from "@/components/app/client-shell";
import { getAccountType } from "@/lib/auth/account-type";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function MesDevisLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <>{children}</>;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <>{children}</>;
  }

  const role = await getAccountType(supabase, user.id);
  if (role === "client") {
    return <ClientShell>{children}</ClientShell>;
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Mes devis (vue client)</p>
          <Link href="/app" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Espace artisan
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
