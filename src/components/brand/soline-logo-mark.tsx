import Image from "next/image";

import { cn } from "@/lib/utils";

/** Logo carré Soline (maison + bulle), source : public/brand/soline-logo*.png. */
export function SolineLogoMark({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <Image
      src={size > 48 ? "/brand/soline-logo-192.png" : "/brand/soline-logo-96.png"}
      alt=""
      aria-hidden
      width={size}
      height={size}
      priority
      className={cn("size-10 shrink-0 rounded-xl shadow-sm", className)}
    />
  );
}
