/**
 * Vitrine publique : fond clair forcé pour les composants shadcn (RDV, widget estimation)
 * même lorsque le visiteur a le thème système sombre sur le reste de l'app.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="light min-h-screen">{children}</div>;
}
