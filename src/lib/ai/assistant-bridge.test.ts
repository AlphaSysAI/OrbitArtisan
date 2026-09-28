import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("assistant-bridge (assistant chargé à la demande)", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as { window?: EventTarget }).window = new EventTarget();
  });
  afterEach(() => {
    delete (globalThis as { window?: EventTarget }).window;
  });

  it("rejoue une ouverture demandée avant le montage de l'assistant", async () => {
    const { openArtisanAssistant, onArtisanAssistantOpen } = await import("@/lib/ai/assistant-bridge");
    openArtisanAssistant({ handsFree: true });
    const handler = vi.fn();
    const off = onArtisanAssistantOpen(handler);
    await Promise.resolve();
    expect(handler).toHaveBeenCalledWith({ handsFree: true });
    off();
  });

  it("transmet directement quand l'assistant écoute, sans rejouer ensuite", async () => {
    const { openArtisanAssistant, onArtisanAssistantOpen } = await import("@/lib/ai/assistant-bridge");
    const handler = vi.fn();
    const off = onArtisanAssistantOpen(handler);
    openArtisanAssistant({ message: "Devis salle de bain" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ message: "Devis salle de bain" });
    off();
    const late = vi.fn();
    onArtisanAssistantOpen(late);
    await Promise.resolve();
    expect(late).not.toHaveBeenCalled();
  });
});
