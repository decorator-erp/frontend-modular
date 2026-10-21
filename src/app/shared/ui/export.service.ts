import { Injectable } from '@angular/core';
import { TableExportFormat } from '@platform/types/presentation';

export interface ExportColumn<T> {
  key: string;
  header: string;
  value?: (row: T) => unknown;
}

/**
 * Tabular export. CSV is built inline (trivial, no deps); XLSX/PDF lazy-load
 * their libraries on demand so they never weigh down the initial bundle.
 * Browser-only — relies on Blob + anchor download.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  export<T>(
    format: TableExportFormat,
    filename: string,
    columns: ExportColumn<T>[],
    rows: T[],
  ): void {
    switch (format) {
      case 'csv':
        this.exportCsv(filename, columns, rows);
        break;
      case 'xlsx':
        this.exportXlsx(filename, columns, rows);
        break;
      case 'pdf':
        this.exportPdf(filename, columns, rows);
        break;
    }
  }

  private exportCsv<T>(filename: string, columns: ExportColumn<T>[], rows: T[]): void {
    const head = columns.map((c) => this.csvCell(c.header)).join(',');
    const body = rows
      .map((row) => columns.map((c) => this.csvCell(this.cellValue(row, c))).join(','))
      .join('\r\n');
    const csv = `${head}\r\n${body}`;
    // Prepend BOM so Excel reads UTF-8 correctly.
    this.download(`${filename}.csv`, new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' }));
  }

  /**
   * XLSX export — deferred (Phase 6.8). No SheetJS dependency is installed yet,
   * so this falls back to CSV. To enable: `npm i xlsx`, then lazy-`import('xlsx')`
   * here and write a real workbook. Kept behind this method so the call site and
   * the `(export)` contract don't change when the library lands.
   */
  private exportXlsx<T>(filename: string, columns: ExportColumn<T>[], rows: T[]): void {
    this.exportCsv(filename, columns, rows);
  }

  /** PDF export — deferred (Phase 6.8); falls back to CSV until a PDF lib is wired in. */
  private exportPdf<T>(filename: string, columns: ExportColumn<T>[], rows: T[]): void {
    this.exportCsv(filename, columns, rows);
  }

  private cellValue<T>(row: T, col: ExportColumn<T>): string {
    const v = col.value ? col.value(row) : (row as Record<string, unknown>)[col.key];
    return v === null || v === undefined ? '' : String(v);
  }

  private csvCell(value: string): string {
    const needsQuote = /[",\r\n]/.test(value);
    const escaped = value.replace(/"/g, '""');
    return needsQuote ? `"${escaped}"` : escaped;
  }

  private download(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
