/**
 * Constantes et types du questionnaire estimation SANS dépendance à zod.
 * Importés par les composants client du tunnel / widget (`chat-step`,
 * `chat-turn`) : passer par `chat-schema` embarquait zod (~73 KB gz) dans
 * le bundle de `/estimation` et `/embed/[slug]`.
 */

/** Nombre maximum de questions posées avant de passer à la suite du tunnel. */
export const MAX_LEAD_CHAT_QUESTIONS = 4;

export type LeadChatMessage = { role: "assistant" | "user"; content: string };
