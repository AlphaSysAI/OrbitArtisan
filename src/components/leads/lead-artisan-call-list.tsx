import { MapPin, Phone, Store } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import type { MatchedArtisan } from "@/lib/leads/types";
import { cn } from "@/lib/utils";

function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return `tel:${digits || phone.replace(/\s/g, "")}`;
}

function ArtisanRow({
  artisan,
  callLabel,
}: {
  artisan: MatchedArtisan;
  callLabel: string;
}) {
  const canCall = Boolean(artisan.phone?.trim());

  return (
    <li className="flex items-center gap-3 rounded-xl border bg-background p-4 text-left">
      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-base font-semibold">
        {artisan.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artisan.logoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          artisan.businessName.charAt(0).toUpperCase()
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{artisan.businessName}</p>
        {artisan.city || artisan.distanceKm != null ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            {artisan.city ?? "—"}
            {artisan.distanceKm != null && (
              <span className="text-foreground">· à {artisan.distanceKm} km</span>
            )}
          </p>
        ) : null}
      </div>
      {canCall ? (
        <a
          href={telHref(artisan.phone!)}
          className={cn(buttonVariants({ variant: "default", size: "sm" }), "shrink-0 gap-1.5")}
        >
          <Phone className="size-4" />
          {callLabel}
        </a>
      ) : (
        <Link
          href={`/site/${artisan.slug}`}
          target="_blank"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0 gap-1.5")}
        >
          <Store className="size-4" />
          Vitrine
        </Link>
      )}
    </li>
  );
}

export function LeadArtisanCallList({
  artisans,
  directToOwner = false,
}: {
  artisans: MatchedArtisan[];
  directToOwner?: boolean;
}) {
  if (!artisans.length) return null;

  return (
    <div className="w-full max-w-md space-y-3 pt-2 text-left">
      <p className="text-center text-sm font-medium">
        {directToOwner ? "Tu peux aussi appeler directement" : "Appeler un artisan"}
      </p>
      <ul className="space-y-3">
        {artisans.map((artisan) => (
          <ArtisanRow
            key={artisan.id}
            artisan={artisan}
            callLabel={directToOwner ? "Appeler mon artisan" : "Appeler"}
          />
        ))}
      </ul>
    </div>
  );
}
