import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Shared Lead-Intake validation — mirrored from the backend (FluentValidation +
 * domain), so both the office intake form and the anonymous public form enforce the
 * same rules before a request is sent. Pure and synchronous; the server remains the
 * authority (`crm.leads.SectorMismatch`, `DesignerExperienceWithoutUse`,
 * `ExperienceReasonWithoutExperience`).
 */

/**
 * Max string lengths — the backend's validators and column limits (`CrmLeadValidationRules`,
 * `CrmLeadIntakeDataValidator`). Single source of truth for both forms. LI-1 aligned them: several
 * were larger than the server's, so a value the form accepted came back as a 400.
 */
export const INTAKE_LIMITS = {
  jobTitle: 128,
  clientAddress: 512,
  unitAddress: 512,
  designerExperienceReason: 1000,
  firstName: 128,
  lastName: 128,
  email: 256,
  phone: 32,
  notes: 2000,
} as const;

/** `area_sqm` is `numeric(8,2)` — reject an oversized value client-side, not as an opaque 400. */
export const AREA_SQM_MIN = 0;
export const AREA_SQM_MAX = 999999.99;

// (The residential-block-vs-sector rule is enforced structurally: the payload only
// includes `residential` when the sector is Residential — no runtime guard needed.)

/** True when a control holds a meaningful value (not null/undefined/''). */
function isSet(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

/**
 * Cross-field rules for the intake group (default control names shared by both forms:
 * `usedDesignerBefore`, `designerExperience`, `designerExperienceReason`). Surfaces
 * group-level keys the form renders near the designer-history section:
 *   - `designerExperienceWithoutUse` — experience set but `usedDesignerBefore !== true`.
 *   - `experienceReasonWithoutExperience` — a reason without an experience.
 */
export function intakeDesignerRulesValidator(names?: {
  usedDesignerBefore?: string;
  designerExperience?: string;
  designerExperienceReason?: string;
}): ValidatorFn {
  const usedKey = names?.usedDesignerBefore ?? 'usedDesignerBefore';
  const expKey = names?.designerExperience ?? 'designerExperience';
  const reasonKey = names?.designerExperienceReason ?? 'designerExperienceReason';

  return (group: AbstractControl): ValidationErrors | null => {
    const fg = group as FormGroup;
    const usedBefore = fg.get(usedKey)?.value === true;
    const hasExperience = isSet(fg.get(expKey)?.value);
    const hasReason = isSet(fg.get(reasonKey)?.value);

    const errors: ValidationErrors = {};
    if (hasExperience && !usedBefore) errors['designerExperienceWithoutUse'] = true;
    if (hasReason && !hasExperience) errors['experienceReasonWithoutExperience'] = true;
    return Object.keys(errors).length ? errors : null;
  };
}
