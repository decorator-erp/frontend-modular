import { TemplateRef } from '@angular/core';
import { EmptyCta } from '../empty-state/pera-empty.component';

export interface ColumnDef<T> {
  key: string;
  header: string;
  /** Fixed width in px. */
  width?: number;
  /** Minimum width in px (column flexes). */
  minWidth?: number;
  sortable?: boolean;
  /** Custom cell renderer; receives the row as `$implicit`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template?: TemplateRef<any>;
  /** Value accessor; defaults to `row[key]`. */
  value?: (row: T) => unknown;
  /** Hide the column label/value pair on the mobile card view. */
  hideOnMobile?: boolean;
  /** Hidden by default in the column-visibility menu (user can re-enable). */
  hidden?: boolean;
  /** Exclude from CSV/XLSX/PDF export (e.g. action/template-only columns). */
  noExport?: boolean;
}

// Moved to platform/types/presentation.ts at spec 003-T03 (the shared <-> ds
// tangle resolution) and re-exported here so every DS-internal consumer and
// the barrel stay unchanged.
export type { TableExportFormat } from '@platform/types/presentation';

export interface TableSort {
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

export interface TableRowAction<T> {
  label: string;
  action: (row: T) => void;
  capability?: string;
  tone?: 'default' | 'danger';
  /** Hide the action for rows where this returns false. */
  visible?: (row: T) => boolean;
}

export interface TableBulkAction {
  label: string;
  action: (ids: Set<string>) => void;
  capability?: string;
}

export interface TableEmpty {
  title: string;
  description?: string;
  cta?: EmptyCta;
}
