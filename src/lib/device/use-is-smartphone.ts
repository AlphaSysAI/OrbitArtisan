"use client";

import * as React from "react";

/** Détection légère smartphone (GPS fiable) — hors tablettes et desktop. */
export function detectSmartphone(): boolean {
  if (typeof navigator === "undefined") return false;

  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile === true) return true;
  if (uaData?.mobile === false) return false;

  const ua = navigator.userAgent;
  if (/iPhone|iPod/i.test(ua)) return true;
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true;
  if (/IEMobile|Opera Mini|webOS|BlackBerry/i.test(ua)) return true;

  return false;
}

export function useIsSmartphone(): boolean {
  const [isSmartphone, setIsSmartphone] = React.useState(false);

  React.useEffect(() => {
    setIsSmartphone(detectSmartphone());
  }, []);

  return isSmartphone;
}
