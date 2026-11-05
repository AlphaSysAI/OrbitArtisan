import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Soline",
    short_name: "Soline",
    description:
      "Le SaaS tout‑en‑un pour artisans : devis, factures, planning, et site vitrine avec prise de RDV.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#1e2f42",
    theme_color: "#1e2f42",
    lang: "fr",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/brand/soline-logo-192.png",
        type: "image/png",
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: "/brand/soline-logo-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any",
      },
      {
        // Le logo tient dans la zone sûre (cercle de 80 %) : utilisable tel quel en masquable.
        src: "/brand/soline-logo-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable",
      },
    ],
  };
}
