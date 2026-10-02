/** Pont léger entre la page devis et le FAB assistant (événements window). */

type AssistantOpenOptions = {
  /** Pré-remplit le champ de saisie à l'ouverture. */
  message?: string;
  /** Active la dictée mains libres dès l'ouverture. */
  handsFree?: boolean;
};

const ASSISTANT_OPEN_EVENT = "soline:assistant-open";

/** Nombre d'assistants à l'écoute (0 tant que le composant, chargé à la demande, n'est pas monté). */
let listenerCount = 0;
/** Ouverture demandée avant le montage de l'assistant : rejouée à l'abonnement. */
let pendingOpen: AssistantOpenOptions | null = null;

export function openArtisanAssistant(options: AssistantOpenOptions = {}) {
  if (typeof window === "undefined") return;
  if (listenerCount === 0) {
    pendingOpen = options;
    return;
  }
  window.dispatchEvent(new CustomEvent<AssistantOpenOptions>(ASSISTANT_OPEN_EVENT, { detail: options }));
}

export function onArtisanAssistantOpen(handler: (options: AssistantOpenOptions) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<AssistantOpenOptions>).detail ?? {};
    handler(detail);
  };

  window.addEventListener(ASSISTANT_OPEN_EVENT, listener);
  listenerCount += 1;

  if (pendingOpen) {
    const options = pendingOpen;
    pendingOpen = null;
    queueMicrotask(() => handler(options));
  }

  return () => {
    window.removeEventListener(ASSISTANT_OPEN_EVENT, listener);
    listenerCount = Math.max(0, listenerCount - 1);
  };
}
