import { Profile, validateXsd } from "@stackforge-eu/factur-x";

import { FacturXValidationError } from "./types";
import type { FacturXProfile } from "./types";

export type FacturXValidationOptions = {
  /** Validation XSD via @stafyniaksacha/facturx (défaut: true). */
  xsd?: boolean;
  /** Règles métier EN16931 Schematron (défaut: true sauf FACTURX_SKIP_SCHEMATRON=1). */
  schematron?: boolean;
  /** Double validation XSD via @stackforge-eu/factur-x (défaut: true sauf FACTURX_SKIP_STACKFORGE=1). */
  stackforgeXsd?: boolean;
};

const STACKFORGE_PROFILE: Record<FacturXProfile, Profile> = {
  basic: Profile.BASIC,
  en16931: Profile.EN16931,
};

/**
 * Valide un XML Factur-X avant embarquement PDF — XSD StackForge + Schematron stafyniaksacha.
 */
export async function validateFacturXXml(
  xml: string,
  profile: FacturXProfile,
  options: FacturXValidationOptions = {},
): Promise<void> {
  const runStafyniak =
    options.xsd !== false && process.env.FACTURX_SKIP_STAFYNAKSA !== "1";
  const runSchematron =
    options.schematron !== false && process.env.FACTURX_SKIP_SCHEMATRON !== "1";
  const runStackforge =
    options.stackforgeXsd !== false && process.env.FACTURX_SKIP_STACKFORGE !== "1";
  const errors: string[] = [];
  let stackforgeOk = false;

  if (runStackforge) {
    try {
      const stackProfile = STACKFORGE_PROFILE[profile];
      const stackResult = await validateXsd(xml, stackProfile);
      if (!stackResult.valid) {
        errors.push(
          ...stackResult.errors.map((e) => `[stackforge] ${e.message ?? JSON.stringify(e)}`),
        );
      } else {
        stackforgeOk = true;
      }
    } catch (error) {
      errors.push(`[stackforge] ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (runStafyniak) {
    try {
      const { check } = await import("@stafyniaksacha/facturx");
      const result = await check({
        xml,
        flavor: "facturx",
        level: profile,
        schematron: runSchematron,
      });
      if (!result.valid) {
        errors.push(...result.errors.map((e) => `[stafyniaksacha] ${e}`));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!stackforgeOk && runStackforge === false) {
        errors.push(`[stafyniaksacha] ${message}`);
      } else if (!stackforgeOk) {
        errors.push(`[validation] ${message}`);
      } else {
        console.warn("[factur-x] Schematron stafyniaksacha indisponible, XSD StackForge seul.", message);
      }
    }
  }

  if (errors.length) {
    throw new FacturXValidationError("XML Factur-X non conforme.", errors);
  }

  if (!runStackforge && !runStafyniak) {
    throw new FacturXValidationError("Validation Factur-X désactivée.", ["no_validator_enabled"]);
  }
}
