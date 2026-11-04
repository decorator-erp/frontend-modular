// The stage-template slice of the old `shared/api/models.ts` at SOURCE_SHA (spec 005): lines
// 30–54, byte-for-byte.

/** Mirrors StageTemplateListResponse. */
export interface StageTemplateRef {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  /** 'System' | 'Custom' when the API exposes it; null otherwise. System templates are immutable. */
  type: string | null;
}

/** Projects.Contracts `StageTemplateType` (Enums.cs: System = 1, Custom = 2), by name. */
export type StageTemplateType = 'System' | 'Custom';

/**
 * Create a stage template — `POST /api/stage-templates` (`CreateStageTemplateCommand`,
 * TemplateContracts.cs:10). New templates are `Custom`; the service sends `type` as the enum int.
 */
export interface CreateStageTemplateRequest {
  name: string;
  type: StageTemplateType;
  isDefault?: boolean;
  description?: string | null;
}

/** Update a stage template — `PUT /api/stage-templates/{id}`. (System templates 409.) */
export interface UpdateStageTemplateRequest {
  name: string;
  description?: string | null;
  isDefault?: boolean;
}

/**
 * Mirrors StageResponse — one stage of a stage template, `GET /api/stage-templates/{id}/stages`
 * (008b #10, KNOWN-DELTA-3). `defaultFee: null` = no default fee (a scope item picking it starts
 * at 0); `taskCount` is the number of template tasks under the stage.
 */
export interface TemplateStage {
  id: string;
  stageTemplateId: string;
  name: string;
  description: string | null;
  order: number;
  weightPercent: number;
  defaultFee: number | null;
  taskCount: number;
}
