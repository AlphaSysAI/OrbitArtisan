"use client";

import * as React from "react";
import { PhoneForwarded, PhoneOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { isAppleMobileUserAgent, ussdToTelHref } from "@/lib/voice/call-forwarding-ussd";
import { cn } from "@/lib/utils";

/** Ouvre le clavier Téléphone sans numéro (iOS accepte `tel:` vide). */
const OPEN_PHONE_DIALER_HREF = "tel:";

const COPY_HINT = "Collez dans le clavier (appui long), puis composez.";

function detectIosWeb(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isAppleMobileUserAgent(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/** Copie synchrone pour garder le geste utilisateur avant `tel:` (Safari). */
function copyUssdCodeSync(code: string): boolean {
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = code;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, code.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

function openEmptyPhoneDialer(): void {
  window.location.assign(OPEN_PHONE_DIALER_HREF);
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

  function onActivateIos() {
    if (!activateCode) return;
    const copied = copyUssdCodeSync(activateCode);
    openEmptyPhoneDialer();
    if (copied) {
      toast.success("Code copié", { description: COPY_HINT, duration: 6000 });
    } else {
      toast.error("Copie impossible", { description: COPY_HINT, duration: 6000 });
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
        <Button type="button" className="w-full gap-2 sm:flex-1" onClick={onActivateIos}>
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
