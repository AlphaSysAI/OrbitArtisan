import { describe, expect, it } from "vitest";

import { isProvisionalSlug, provisionalSlug, slugFromBusinessName } from "./provisional-slug";

const SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe("slug provisoire", () => {
  it("respecte le format SQL et est reconnu comme provisoire", () => {
    const s = provisionalSlug();
    expect(s).toMatch(SLUG_FORMAT);
    expect(isProvisionalSlug(s)).toBe(true);
    expect(provisionalSlug()).not.toBe(s);
  });
  it("un slug choisi par l'artisan n'est jamais pris pour un provisoire", () => {
    expect(isProvisionalSlug("nouveau-plombier")).toBe(false);
    expect(isProvisionalSlug("plomberie-dupont")).toBe(false);
    expect(isProvisionalSlug(null)).toBe(false);
  });
});

describe("slug depuis la raison sociale", () => {
  it.each([
    ["Plomberie Dupont & Fils", "plomberie-dupont-fils"],
    ["  Élec'Pro — Carcassonne ", "elec-pro-carcassonne"],
    ["SARL L'Atelier du Bois", "sarl-l-atelier-du-bois"],
  ])("%s → %s", (name, slug) => {
    expect(slugFromBusinessName(name)).toBe(slug);
    expect(slug).toMatch(SLUG_FORMAT);
  });
  it("vide ou sans caractère utilisable → chaîne vide", () => {
    expect(slugFromBusinessName("—")).toBe("");
  });
  it("tronqué à 60 caractères sans tiret final", () => {
    const s = slugFromBusinessName("a ".repeat(40));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s).toMatch(SLUG_FORMAT);
  });
});
