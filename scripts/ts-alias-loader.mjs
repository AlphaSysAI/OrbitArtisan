/** Résout les imports `@/...` pour exécuter du code source TS directement sous Node. */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    // Les imports du projet sont sans extension : Node en exige une.
    return next(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
  }
  return next(specifier, context);
}
