import type { CatalogKey } from '@platform/i18n/catalog/en';

/**
 * sites S-1: the Sites enums as the integers the wire carries (contract §1.7; dms
 * `Sites.Contracts/Enums.cs`). Each enum has its EN/AR label keys (`sv.e.*`). Never compare by
 * name: the numbering is the backend's (`SiteItemDataType` is NOT CRM's numbering).
 */
export const SiteStatus = { Draft: 1, Submitted: 2, Approved: 3, Rejected: 4 } as const;
export type SiteStatus = (typeof SiteStatus)[keyof typeof SiteStatus];

export const SiteDocumentKind = { Sketch: 1, Video: 2, Photo: 3 } as const;
export type SiteDocumentKind = (typeof SiteDocumentKind)[keyof typeof SiteDocumentKind];

export const SiteItemDataType = { Number: 1, Text: 2, Bool: 3, Select: 4, Date: 5 } as const;
export type SiteItemDataType = (typeof SiteItemDataType)[keyof typeof SiteItemDataType];

export const UnitType = { Apartment: 1, Villa: 2, Duplex: 3, Studio: 4 } as const;
export type UnitType = (typeof UnitType)[keyof typeof UnitType];

export const UnitCondition = { BareBrick: 1, SemiFinished: 2, Renovation: 3 } as const;
export type UnitCondition = (typeof UnitCondition)[keyof typeof UnitCondition];

export const UnitPosition = { Corner: 1, Facade: 2 } as const;
export type UnitPosition = (typeof UnitPosition)[keyof typeof UnitPosition];

export const BuildingKind = { Tower: 1, Private: 2 } as const;
export type BuildingKind = (typeof BuildingKind)[keyof typeof BuildingKind];

export const ElevatorStatus = { Working: 1, NotWorking: 2, None: 3 } as const;
export type ElevatorStatus = (typeof ElevatorStatus)[keyof typeof ElevatorStatus];

type EnumObject = Readonly<Record<string, number>>;

/** Map a wire value (int, numeric string or member name) to the enum's int; anything else → null. */
export function toEnumInt<E extends EnumObject>(e: E, raw: unknown): E[keyof E] | null {
  const values = Object.values(e) as number[];
  if (typeof raw === 'number') return values.includes(raw) ? (raw as E[keyof E]) : null;
  if (typeof raw === 'string') {
    if (/^\d+$/.test(raw)) return toEnumInt(e, Number(raw));
    const hit = Object.keys(e).find((k) => k.toLowerCase() === raw.toLowerCase());
    return hit ? (e[hit] as E[keyof E]) : null;
  }
  return null;
}

/** Each enum's member name by int, for the `sv.e.<Enum>.<Member>` label keys. */
function labels<E extends EnumObject>(prefix: string, e: E): Record<number, CatalogKey> {
  const out: Record<number, CatalogKey> = {};
  for (const [name, value] of Object.entries(e)) out[value] = `${prefix}.${name}` as CatalogKey;
  return out;
}

export const SITE_STATUS_LABEL = labels('sv.e.SiteStatus', SiteStatus);
export const SITE_DOCUMENT_KIND_LABEL = labels('sv.e.SiteDocumentKind', SiteDocumentKind);
export const SITE_ITEM_DATA_TYPE_LABEL = labels('sv.e.SiteItemDataType', SiteItemDataType);
export const UNIT_TYPE_LABEL = labels('sv.e.UnitType', UnitType);
export const UNIT_CONDITION_LABEL = labels('sv.e.UnitCondition', UnitCondition);
export const UNIT_POSITION_LABEL = labels('sv.e.UnitPosition', UnitPosition);
export const BUILDING_KIND_LABEL = labels('sv.e.BuildingKind', BuildingKind);
export const ELEVATOR_STATUS_LABEL = labels('sv.e.ElevatorStatus', ElevatorStatus);

/** Status → `pera-status-badge` tone (prototype `statusChip`, `sites.js:226`). */
export const SITE_STATUS_TONE: Record<SiteStatus, 'neutral' | 'pending' | 'success' | 'error'> = {
  1: 'neutral',
  2: 'pending',
  3: 'success',
  4: 'error',
};
