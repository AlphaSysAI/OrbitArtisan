"use client";

import { Share } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  isAndroid,
  isIos,
  isLikelyMobileDevice,
  isStandaloneDisplay,
  rememberInstallPromptDismissed,
  wasInstallPromptDismissedRecently,
} from "@/lib/pwa/client-detect";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type InstallGuide = "main" | "ios" | "android-manual";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaRootClient() {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [guide, setGuide] = useState<InstallGuide>("main");
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  /** Enregistrement du service worker (critère d’éligibilité à l’installation sur Chrome). */
  useEffect(() => {
    if (!mounted || typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, [mounted]);

  /** beforeinstallprompt : conserver l’événement pour le bouton d’installation. */
  useEffect(() => {
    if (!mounted) return;
    const onBip = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onInstalled = () => {
      setDialogOpen(false);
      deferredRef.current = null;
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, [mounted]);

  /** Redirection depuis la page d’accueil en mode « appli » selon le compte connecté. */
  useEffect(() => {
    if (!mounted || pathname !== "/") return;
    if (!isStandaloneDisplay()) return;

    let cancelled = false;
    (async () => {
      let supabase;
      try {
        supabase = createSupabaseBrowserClient();
      } catch {
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      const { data: artisanProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (artisanProfile) {
        router.replace("/app");
        return;
      }

      const { data: customerProfile } = await supabase
        .from("customer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (customerProfile) {
        router.replace("/compte");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mounted, pathname, router]);

  /** Affichage différé de la modale d’installation (mobile, navigateur, pas déjà installé). */
  useEffect(() => {
    if (!mounted) return;
    if (isStandaloneDisplay()) return;
    if (!isLikelyMobileDevice()) return;
    if (wasInstallPromptDismissedRecently()) return;

    const t = window.setTimeout(() => {
      if (isStandaloneDisplay()) return;
      if (!isLikelyMobileDevice()) return;
      setDialogOpen(true);
    }, 2000);

    return () => window.clearTimeout(t);
  }, [mounted]);

  const dismiss = useCallback(() => {
    rememberInstallPromptDismissed();
    setDialogOpen(false);
    setGuide("main");
  }, []);

  const handlePrimaryInstall = useCallback(async () => {
    const deferred = deferredRef.current;
    if (deferred) {
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        deferredRef.current = null;
        if (choice.outcome === "accepted") {
          setDialogOpen(false);
        }
      } catch {
        deferredRef.current = null;
      }
      return;
    }

    if (isIos()) {
      setGuide("ios");
      return;
    }

    if (isAndroid()) {
      setGuide("android-manual");
      return;
    }

    setGuide("android-manual");
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        dismiss();
        return;
      }
      setDialogOpen(true);
    },
    [dismiss],
  );

  if (!mounted) return null;

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 sm:max-w-md" showCloseButton>
        <div className="p-6 pb-4">
          <DialogHeader className="gap-2 text-left">
            <DialogTitle className="text-lg">
              {guide === "main"
                ? "Installer Orbit Artisan sur votre téléphone"
                : guide === "ios"
                  ? "Installation sur iPhone ou iPad"
                  : "Installation sur Android"}
            </DialogTitle>
            {guide === "main" ? (
              <DialogDescription>
                Accédez à vos devis et messages comme à une application : icône sur
                l’écran d’accueil, sans barre d’adresse du navigateur.
              </DialogDescription>
            ) : (
              <DialogDescription className="sr-only">
                Instructions pour ajouter le site à l’écran d’accueil.
              </DialogDescription>
            )}
          </DialogHeader>
          {guide === "ios" ? (
            <ol className="mt-3 list-decimal space-y-3 pl-4 text-sm text-foreground/90">
              <li>
                Touchez le bouton{" "}
                <span className="inline-flex items-center gap-1 font-medium text-foreground">
                  <Share className="inline h-4 w-4" aria-hidden />
                  Partager
                </span>{" "}
                (Safari : en bas ; Chrome : menu puis Partager).
              </li>
              <li>
                Faites défiler la liste grise et touchez{" "}
                <strong>Sur l’écran d’accueil</strong>, puis <strong>Ajouter</strong>.
              </li>
            </ol>
          ) : null}
          {guide === "android-manual" ? (
            <ol className="mt-3 list-decimal space-y-3 pl-4 text-sm text-foreground/90">
              <li>
                Touchez le menu <strong>⋮</strong> du navigateur (souvent en haut à
                droite dans Chrome).
              </li>
              <li>
                Choisissez <strong>Ajouter à l’écran d’accueil</strong> ou{" "}
                <strong>Installer l’application</strong> (libellé selon le navigateur).
              </li>
              <li className="text-muted-foreground">
                Sur Firefox ou Samsung Internet, cherchez une option du même type dans
                le menu.
              </li>
            </ol>
          ) : null}
        </div>
        <DialogFooter className="flex-col gap-2 border-t bg-muted/40 px-6 py-4 sm:flex-col">
          {guide === "main" ? (
            <>
              <Button type="button" className="w-full" onClick={handlePrimaryInstall}>
                Installer sur l&apos;écran d&apos;accueil
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={dismiss}
              >
                Plus tard
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                className="w-full"
                onClick={() => setGuide("main")}
              >
                Retour
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={dismiss}>
                Fermer
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
