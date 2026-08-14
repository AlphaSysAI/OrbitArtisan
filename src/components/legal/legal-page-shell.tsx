import Link from "next/link";
import { Building2 } from "lucide-react";

import { LEGAL_LAST_UPDATED, LEGAL_PUBLISHER } from "@/lib/legal/site-legal-info";

const LEGAL_LINKS = [
  { href: "/cgu", label: "CGU" },
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/confidentialite", label: "Confidentialité" },
] as const;

type LegalPageShellProps = {
  title: string;
  children: React.ReactNode;
};

export function LegalPageShell({ title, children }: LegalPageShellProps) {
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-slate-900 text-orange-400">
              <Building2 className="size-5" strokeWidth={2.2} />
            </span>
            <span className="text-lg font-bold tracking-tight">{LEGAL_PUBLISHER.productName}</span>
          </Link>
          <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Retour à l&apos;accueil
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Dernière mise à jour : {LEGAL_LAST_UPDATED}
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          {title}
        </h1>
        <article className="prose-legal mt-8 space-y-6 text-sm leading-relaxed text-slate-700 sm:text-base">
          {children}
        </article>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50 py-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 sm:px-6">
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-600">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-slate-900">
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} {LEGAL_PUBLISHER.productName} — {LEGAL_PUBLISHER.companyName}
          </p>
        </div>
      </footer>
    </div>
  );
}
