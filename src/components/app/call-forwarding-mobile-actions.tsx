"use client";

import * as React from "react";
import { PhoneForwarded, PhoneOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { isAppleMobileUserAgent, ussdToTelHref } from "@/lib/voice/call-forwarding-ussd";
import { cn } from "@/lib/utils";

const COPY_HINT =
  "Ouvrez l’app Téléphone, collez dans le clavier numérique (appui long), puis composez.";

function detectIosWeb(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isAppleMobileUserAgent(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

async function copyUssdCode(code: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(code);
    return true;
  } catch {
    return false;
  }
}

export function CallForwardingMobileActions({
  activateCode,
  cancelCode,
  disabled,
}: {
  activateCode: string | null;
  cancelCode: string;
  disabled: boolean;
}) {
  const [useCopyForActivate, setUseCopyForActivate] = React.useState(false);

  React.useEffect(() => {
    setUseCopyForActivate(detectIosWeb());
  }, []);

  async function onCopyActivate() {
    if (!activateCode) return;
    const ok = await copyUssdCode(activateCode);
    if (ok) {
      toast.success("Code copié", { description: COPY_HINT, duration: 8000 });
    } else {
      toast.error("Copie impossible", { description: COPY_HINT, duration: 8000 });
    }
  }

  const activateHref = activateCode ? ussdToTelHref(activateCode) : null;
  const cancelHref = ussdToTelHref(cancelCode);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {disabled || !activateCode ? (
        <span className={buttonVariants({ className: "pointer-events-none w-full gap-2 opacity-50 sm:flex-1" })}>
          <PhoneForwarded className="size-4" />
          Renvoi d&apos;appel
        </span>
      ) : useCopyForActivate ? (
        <Button type="button" className="w-full gap-2 sm:flex-1" onClick={() => void onCopyActivate()}>
          <PhoneForwarded className="size-4" />
          Renvoi d&apos;appel
        </Button>
      ) : (
        <a href={activateHref!} className={buttonVariants({ className: "w-full gap-2 sm:flex-1" })}>
          <PhoneForwarded className="size-4" />
          Renvoi d&apos;appel
        </a>
      )}

      <a
        href={cancelHref}
        className={cn(buttonVariants({ variant: "outline", className: "w-full gap-2 sm:flex-1" }))}
      >
        <PhoneOff className="size-4" />
        Arrêter le transfert
      </a>
    </div>
  );
}
