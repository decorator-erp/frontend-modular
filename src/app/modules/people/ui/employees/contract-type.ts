/**
 * Contract type as the WIRE spells it.
 *
 * `@shared/enums`' `ContractType` is numeric (1–4) because most enums on this API are ints — no
 * `JsonStringEnumConverter` is registered. `contractType` is the exception: it is declared as a
 * `string` on both `CreateEmployeeCommand` and `UpdateEmployeeCommand` and parsed with
 * `Enum.TryParse`, WITHOUT `ignoreCase`. So the exact PascalCase name is required, and sending the
 * integer the old dialog sent fails validation.
 */
export const CONTRACT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'FullTime', label: 'Full-time' },
  { value: 'PartTime', label: 'Part-time' },
  { value: 'Contract', label: 'Contract' },
  { value: 'Internship', label: 'Internship' },
];

/** Human label for a wire value, falling back to the raw string for anything unrecognised. */
export function contractTypeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return CONTRACT_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
