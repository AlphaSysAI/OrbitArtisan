"use client";

import * as React from "react";

import { BookOpen } from "lucide-react";

import { type CatalogFamily, PlatformCatalogDialog } from "@/components/work-library/platform-catalog-dialog";
import { Button } from "@/components/ui/button";
import type { PlatformWorkItem } from "@/lib/work-library/platform-catalog-types";
import type { WorkCategory, WorkItemWithCategory } from "@/lib/work-library/types";
import { listWorkCategories, listWorkItems } from "@/lib/work-library/actions";

import { WorkLibraryManager } from "./work-library-manager";

export function OuvragesClientShell({
  platformItems,
  platformTradeLabel,
  tradeConfigured,
  catalogFamilies,
  initialItems,
  categories,
  defaultHourlyRateHt,
}: {
  platformItems: PlatformWorkItem[];
  platformTradeLabel: string | null;
  tradeConfigured: boolean;
  catalogFamilies: CatalogFamily[];
  initialItems: WorkItemWithCategory[];
  categories: WorkCategory[];
  defaultHourlyRateHt: number;
}) {
  // Bibliothèque détenue ici : un import depuis le catalogue l'alimente sans rechargement
  // ni remontage, l'artisan garde sa position dans le catalogue Soline.
  const [items, setItems] = React.useState(initialItems);
  const [libraryCategories, setLibraryCategories] = React.useState(categories);

  const refreshLibrary = React.useCallback(async () => {
    const [itemsRes, categoriesRes] = await Promise.all([listWorkItems(), listWorkCategories()]);
    if (itemsRes.ok) setItems(itemsRes.items);
    if (categoriesRes.ok) setLibraryCategories(categoriesRes.items);
  }, []);

  const libraryRefs = React.useMemo(
    () => new Set(items.map((i) => i.reference?.trim().toLowerCase()).filter((r): r is string => !!r)),
    [items],
  );

  const [catalogOpen, setCatalogOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        size="lg"
        className="h-auto w-full justify-start gap-3 rounded-2xl px-5 py-4 text-left sm:w-auto"
        onClick={() => setCatalogOpen(true)}
      >
        <BookOpen className="size-6 shrink-0" />
        <span className="flex flex-col">
          <span className="text-base font-semibold">Piocher dans notre catalogue</span>
          <span className="text-xs font-normal opacity-80">
            Près de 1 900 ouvrages chiffrés, tous métiers — ajoute ceux qui te servent.
          </span>
        </span>
      </Button>

      <PlatformCatalogDialog
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        items={platformItems}
        tradeLabel={platformTradeLabel}
        tradeConfigured={tradeConfigured}
        families={catalogFamilies}
        libraryRefs={libraryRefs}
        onImported={refreshLibrary}
      />

      <WorkLibraryManager
        items={items}
        setItems={setItems}
        categories={libraryCategories}
        onRefresh={refreshLibrary}
        defaultHourlyRateHt={defaultHourlyRateHt}
      />
    </>
  );
}
