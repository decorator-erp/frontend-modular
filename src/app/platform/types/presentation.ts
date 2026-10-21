/**
 * Pure presentational type vocabulary shared by `design-system/` and `shared/`.
 * Type-only, no component code — the resolution of the `shared ↔ ds` tangle
 * (spec 003-T03). `design-system/` re-exports both at their original
 * declaration sites so DS-internal consumers and the barrel are unaffected;
 * `shared/ui/{status,export.service}.ts` import directly from here.
 *
 * Not added to `./index.ts` — the deep import path is the sanctioned one,
 * following the `paged.ts` precedent (spec 002 §6, C2).
 */

/** Tone vocabulary for `<pera-badge>`. Declared at `components/badge/pera-badge.component.ts`. */
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

/** Export format vocabulary for `<pera-data-table>`. Declared at `patterns/data-table/column-def.ts`. */
export type TableExportFormat = 'csv' | 'xlsx' | 'pdf';
