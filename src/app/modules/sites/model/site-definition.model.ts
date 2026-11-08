import type { SiteItemDataType } from './site-enums';

/**
 * sites S-1: the definition (form engine) shapes of dms `Sites.Contracts/Definition/DefinitionContracts.cs`.
 * Global master data: reads `sites.read`, writes `sites.definitions.manage`, no project level.
 */

/** `SiteModuleResponse` (`:43-45`). */
export interface SiteModule {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  isSystem: boolean;
  sortOrder: number;
  isActive: boolean;
}

/** `SiteItemOptionResponse` (`:55-56`). */
export interface SiteItemOption {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  sortOrder: number;
  isActive: boolean;
}

/** `SiteItemResponse` (`:47-50`). */
export interface SiteItem {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  dataType: SiteItemDataType;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
  tolerance: number;
  maxLength: number | null;
  regexPattern: string | null;
  isSystem: boolean;
  isActive: boolean;
  options: SiteItemOption[];
}

/** `SiteSchemaFieldResponse` (`:62-67`): required/visible/order come from the LINK. */
export interface SiteSchemaField {
  linkId: string;
  itemId: string;
  code: string;
  nameEn: string;
  nameAr: string;
  dataType: SiteItemDataType;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
  tolerance: number;
  maxLength: number | null;
  regexPattern: string | null;
  isRequired: boolean;
  isVisible: boolean;
  sortOrder: number;
  options: SiteItemOption[];
}

/** `SiteModuleSchemaResponse` (`:69-72`). */
export interface SiteModuleSchema {
  moduleId: string;
  code: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  sortOrder: number;
  fields: SiteSchemaField[];
}

/** `SiteItemUsageResponse` (`:75-80`). */
export interface SiteItemUsage {
  itemId: string;
  code: string;
  hasCapturedValues: boolean;
  capturedValueCount: number;
  modules: { moduleId: string; code: string; isRequired: boolean; isActive: boolean }[];
}

export interface CreateSiteModuleRequest {
  code: string;
  nameEn: string;
  nameAr: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  sortOrder?: number;
}

export interface UpdateSiteModuleRequest {
  nameEn: string;
  nameAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  sortOrder: number;
}

export interface CreateSiteItemRequest {
  code: string;
  nameEn: string;
  nameAr: string;
  dataType: SiteItemDataType;
  unit?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  tolerance?: number;
  maxLength?: number | null;
  regexPattern?: string | null;
}

export interface UpdateSiteItemRequest {
  nameEn: string;
  nameAr: string;
  minValue: number | null;
  maxValue: number | null;
  maxLength: number | null;
  regexPattern: string | null;
}

export interface ChangeSiteItemShapeRequest {
  code: string;
  dataType: SiteItemDataType;
  unit: string | null;
  tolerance: number;
}

export interface SiteItemOptionRequest {
  code: string;
  nameEn: string;
  nameAr: string;
  sortOrder?: number;
}

export interface UpdateSiteItemOptionRequest {
  nameEn: string;
  nameAr: string;
  sortOrder: number;
}

export interface AttachSiteItemRequest {
  itemId: string;
  isRequired?: boolean;
  isVisible?: boolean;
  sortOrder?: number;
}

export interface UpdateSiteLinkRequest {
  isRequired: boolean;
  isVisible: boolean;
  sortOrder: number;
}

export interface SiteLinkOrder {
  itemId: string;
  sortOrder: number;
}
