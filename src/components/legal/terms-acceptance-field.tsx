import Link from "next/link";

import { getMarketingLegalHref } from "@/lib/site-url";

type TermsAcceptanceFieldProps = {
  id?: string;
  name?: string;
};

export function TermsAcceptanceField({ id = "accept_terms", name = "accept_terms" }: TermsAcceptanceFieldProps) {
  const cguHref = getMarketingLegalHref("/cgu");
  const cgvHref = getMarketingLegalHref("/cgv");

  return (
    <label htmlFor={id} className="flex gap-2.5 text-sm leading-snug text-muted-foreground">
      <input
        id={id}
        name={name}
        type="checkbox"
        required
        value="1"
        className="mt-0.5 size-4 shrink-0 rounded border"
      />
      <span>
        J&apos;accepte les{" "}
        <Link
          href={cguHref}
          className="font-medium text-foreground underline-offset-4 hover:underline"
          target={cguHref.startsWith("http") ? "_blank" : undefined}
          rel={cguHref.startsWith("http") ? "noopener noreferrer" : undefined}
        >
          CGU
        </Link>{" "}
        et les{" "}
        <Link
          href={cgvHref}
          className="font-medium text-foreground underline-offset-4 hover:underline"
          target={cgvHref.startsWith("http") ? "_blank" : undefined}
          rel={cgvHref.startsWith("http") ? "noopener noreferrer" : undefined}
        >
          CGV
        </Link>{" "}
        de Soline.
      </span>
    </label>
  );
}
