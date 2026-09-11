import { Profile, validateXsd } from "@stackforge-eu/factur-x";

import { FacturXValidationError } from "./types";
import type { FacturXProfile } from "./types";

export type FacturXValidationOptions = {
  /** Validation XSD via @stackforge-eu/factur-x (défaut: true). */
  stackforgeXsd?: boolean;
};

const STACKFORGE_PROFILE: Record<FacturXProfile, Profile> = {
  basic: Profile.BASIC,
  en16931: Profile.EN16931,
};

/**
 * Valide un XML Factur-X avant embarquement PDF — XSD StackForge (libxml2-wasm, sans libxmljs).
 *
 * La validation Schematron stafyniaksacha reste disponible en dev via les tests Vitest
 * (`@stafyniaksacha/facturx` en devDependency uniquement).
 */
export async function validateFacturXXml(
  xml: string,
  profile: FacturXProfile,
  options: FacturXValidationOptions = {},
): Promise<void> {
  const runStackforge =
    options.stackforgeXsd !== false && process.env.FACTURX_SKIP_STACKFORGE !== "1";

  if (!runStackforge) {
    throw new FacturXValidationError("Validation Factur-X désactivée.", ["no_validator_enabled"]);
  }

  const errors: string[] = [];

  try {
    const stackProfile = STACKFORGE_PROFILE[profile];
    const stackResult = await validateXsd(xml, stackProfile);
    if (!stackResult.valid) {
      errors.push(
        ...stackResult.errors.map((e) => `[stackforge] ${e.message ?? JSON.stringify(e)}`),
      );
    }
  } catch (error) {
    errors.push(`[stackforge] ${error instanceof Error ? error.message : String(error)}`);
  }

  if (errors.length) {
    throw new FacturXValidationError("XML Factur-X non conforme.", errors);
  }
}
