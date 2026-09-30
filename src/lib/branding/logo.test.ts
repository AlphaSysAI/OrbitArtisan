import { describe, expect, it } from "vitest";

import { detectLogoKind, logoStoragePath, ownLogoStoragePath } from "./logo";

const env = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" } as unknown as NodeJS.ProcessEnv;
const pid = "11111111-2222-3333-4444-555555555555";
const own = `https://abc.supabase.co/storage/v1/object/public/vitrine-media/${pid}/logo/1700000000000.png`;

describe("logo", () => {
  it("détecte PNG / JPEG par signature", () => {
    expect(detectLogoKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("png");
    expect(detectLogoKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(detectLogoKind(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
  it("construit le chemin", () => {
    expect(logoStoragePath(pid, "jpeg", 42)).toBe(`${pid}/logo/42.jpg`);
  });
  it("n'accepte que nos URL de logo", () => {
    expect(ownLogoStoragePath(own, pid, env)).toBe(`${pid}/logo/1700000000000.png`);
    expect(ownLogoStoragePath(own, "99999999-2222-3333-4444-555555555555", env)).toBeNull();
    expect(ownLogoStoragePath("http://169.254.169.254/latest/meta-data", undefined, env)).toBeNull();
    expect(ownLogoStoragePath(`https://abc.supabase.co/storage/v1/object/public/vitrine-media/${pid}/gallery/x.png`, undefined, env)).toBeNull();
    expect(ownLogoStoragePath(`https://abc.supabase.co/storage/v1/object/public/vitrine-media/${pid}/logo/../../x.png`, undefined, env)).toBeNull();
  });
});
