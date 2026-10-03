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

  // « Feuille déposée » : ouvrages animés dans la bibliothèque. `dropEpoch` change à chaque
  // dépôt pour remonter les lignes et rejouer l'animation (cas du rejeu à la fermeture).
  const [freshIds, setFreshIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const [dropEpoch, setDropEpoch] = React.useState(0);
  const [catalogOpen, setCatalogOpen] = React.useState(false);
  const itemsRef = React.useRef(items);
  const catalogOpenRef = React.useRef(false);
  /** Ajouts faits catalogue ouvert : rejoués quand l'artisan referme la fenêtre. */
  const addedWhileOpen = React.useRef(new Set<string>());
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  React.useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const later = React.useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const dropSheets = React.useCallback(
    (ids: Iterable<string>, opts?: { scroll?: boolean }) => {
      const set = new Set(ids);
      if (set.size === 0) return;
      setFreshIds(set);
      setDropEpoch((e) => e + 1);
      if (opts?.scroll) {
        later(() => {
          document.querySelector('[data-fresh-sheet="true"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 30);
      }
      later(() => setFreshIds((current) => (current === set ? new Set() : current)), 2600 + Math.min(set.size * 60, 900));
    },
    [later],
  );

  const refreshLibrary = React.useCallback(async () => {
    const [itemsRes, categoriesRes] = await Promise.all([listWorkItems(), listWorkCategories()]);
    if (itemsRes.ok) {
      const known = new Set(itemsRef.current.map((i) => i.id));
      const added = itemsRes.items.filter((i) => !known.has(i.id)).map((i) => i.id);
      setItems(itemsRes.items);
      if (catalogOpenRef.current) added.forEach((id) => addedWhileOpen.current.add(id));
      dropSheets(added);
    }
    if (categoriesRes.ok) setLibraryCategories(categoriesRes.items);
  }, [dropSheets]);

  const handleCatalogOpenChange = React.useCallback(
    (open: boolean) => {
      setCatalogOpen(open);
      catalogOpenRef.current = open;
      if (open) {
        addedWhileOpen.current = new Set();
        return;
      }
      const added = [...addedWhileOpen.current];
      addedWhileOpen.current = new Set();
      // Après le fondu de fermeture, on repose les fiches sous les yeux de l'artisan.
      if (added.length > 0) later(() => dropSheets(added, { scroll: true }), 160);
    },
    [dropSheets, later],
  );

  const libraryRefs = React.useMemo(
    () => new Set(items.map((i) => i.reference?.trim().toLowerCase()).filter((r): r is string => !!r)),
    [items],
  );

  return (
    <>
      <Button
        type="button"
        size="lg"
        className="h-auto w-full justify-start gap-3 rounded-2xl px-5 py-4 text-left sm:w-auto"
        onClick={() => handleCatalogOpenChange(true)}
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
        onOpenChange={handleCatalogOpenChange}
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
        freshIds={freshIds}
        dropEpoch={dropEpoch}
        defaultHourlyRateHt={defaultHourlyRateHt}
      />
    </>
  );
}
