/** Pont léger entre la page devis et le FAB assistant (événements window). */

export type AssistantOpenOptions = {
  /** Pré-remplit le champ de saisie à l'ouverture. */
  message?: string;
  /** Active la dictée mains libres dès l'ouverture. */
  handsFree?: boolean;
};

export const ASSISTANT_OPEN_EVENT = "soline:assistant-open";

export function openArtisanAssistant(options: AssistantOpenOptions = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AssistantOpenOptions>(ASSISTANT_OPEN_EVENT, { detail: options }));
}

export function onArtisanAssistantOpen(handler: (options: AssistantOpenOptions) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<AssistantOpenOptions>).detail ?? {};
    handler(detail);
  };

  window.addEventListener(ASSISTANT_OPEN_EVENT, listener);
  return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, listener);
}
