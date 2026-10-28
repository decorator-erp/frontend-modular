/**
 * Cost category — per `api-docs/11-finance.md` Section 1.
 *
 * Field names mirror the doc 1:1. Money values are not present on this DTO;
 * this is the catalog entity that budget lines hang off.
 */
export interface CostCategoryResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface CreateCostCategoryRequest {
  code: string;
  name: string;
  description?: string;
}

export interface UpdateCostCategoryRequest {
  name: string;
  description?: string;
}
