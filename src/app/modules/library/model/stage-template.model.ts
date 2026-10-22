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

/** Create a stage template — `POST /api/stage-templates`. New templates default to `Custom`. */
export interface CreateStageTemplateRequest {
  name: string;
  stageTemplateType: string;
  isDefault?: boolean;
  description?: string | null;
}

/** Update a stage template — `PUT /api/stage-templates/{id}`. (System templates 409.) */
export interface UpdateStageTemplateRequest {
  name: string;
  description?: string | null;
  isDefault?: boolean;
}
