// `ContractType`, `ContractTypeLabel` and `coerceEnum` from the old `shared/enums/index.ts` at
// SOURCE_SHA (lines 61–74 and 266–284), byte-for-byte: the only live symbols of that barrel's
// numeric enum side (enum-audit §1; spec 006). The other concepts stay behind (charter §5).

// ---------- ContractType ----------
export const ContractType = {
  FullTime: 1,
  PartTime: 2,
  Contract: 3,
  Internship: 4,
} as const;
export type ContractType = (typeof ContractType)[keyof typeof ContractType];
export const ContractTypeLabel: Record<ContractType, string> = {
  [ContractType.FullTime]: 'Full-time',
  [ContractType.PartTime]: 'Part-time',
  [ContractType.Contract]: 'Contract',
  [ContractType.Internship]: 'Internship',
};

/**
 * Coerce a backend payload value (possibly string or number) into the numeric
 * enum value. Returns `null` when the value cannot be resolved.
 */
export function coerceEnum<E extends Record<string, number>>(
  raw: unknown,
  values: E,
): E[keyof E] | null {
  if (raw == null) return null;
  if (typeof raw === 'number')
    return Object.values(values).includes(raw) ? (raw as E[keyof E]) : null;
  if (typeof raw === 'string') {
    const asNum = Number(raw);
    if (!Number.isNaN(asNum) && Object.values(values).includes(asNum)) return asNum as E[keyof E];
    const direct = (values as Record<string, number>)[raw];
    return direct !== undefined ? (direct as E[keyof E]) : null;
  }
  return null;
}
