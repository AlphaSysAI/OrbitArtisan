import Link from "next/link";
import { notFound } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveVitrineAccent, shadeAccent } from "@/lib/vitrine-theme";

export default async function ArtisanCgvPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name, sales_terms_text, accent_color")
    .eq("slug", slug)
    .maybeSingle();

  if (!profile?.sales_terms_text?.trim()) notFound();

  const accent = resolveVitrineAccent(profile.accent_color, profile.business_name);
  const accentDark = shadeAccent(accent, 0.25);

  return (
    <div className="min-h-screen bg-[#fffbf7] text-neutral-900">
      <div
        className="h-2 w-full"
        style={{ background: `linear-gradient(90deg, ${accent} 0%, ${shadeAccent(accent, 0.15)} 50%, ${accent} 100%)` }}
        aria-hidden
      />

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <Link
          href={`/site/${slug}`}
          className="text-sm font-medium underline-offset-4 hover:underline"
          style={{ color: accentDark }}
        >
          ← Retour à {profile.business_name}
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-neutral-900">
          Conditions générales de vente
        </h1>
        <p className="mt-2 text-neutral-600">{profile.business_name}</p>

        <article className="mt-8 whitespace-pre-wrap rounded-2xl border border-neutral-200 bg-white p-6 text-sm leading-relaxed text-neutral-700 shadow-sm">
          {profile.sales_terms_text.trim()}
        </article>
      </main>
    </div>
  );
}
