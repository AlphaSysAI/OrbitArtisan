"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Rafraîchit la page après retour Stripe jusqu’à ce que le webhook ait mis la facture à jour. */
export function InvoicePaymentRefresh({ expectPaid }: { expectPaid: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!expectPaid) return;

    let n = 0;
    const id = setInterval(() => {
      router.refresh();
      n += 1;
      if (n >= 10) clearInterval(id);
    }, 4000);

    return () => clearInterval(id);
  }, [expectPaid, router]);

  return null;
}
