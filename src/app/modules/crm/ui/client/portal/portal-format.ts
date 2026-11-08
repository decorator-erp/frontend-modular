import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { Observable } from 'rxjs';
import type { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import type { StatusBadgeTone } from '@ds';

/** crmp P2-B: shared bits of the client portal sections (sizes, status chips, authed blobs). */

/** `1.4 MB` / `12 KB` / `512 B`, with the unit from the catalog (EN + AR). */
export function formatFileSize(bytes: number, catalog: CatalogService): string {
  const locale = catalog.locale() === 'ar' ? 'ar-EG' : 'en-GB';
  const fmt = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
  if (bytes >= 1024 * 1024) return catalog.t('cportal.size.mb', { n: fmt(bytes / (1024 * 1024)) });
  if (bytes >= 1024) return catalog.t('cportal.size.kb', { n: fmt(bytes / 1024) });
  return catalog.t('cportal.size.b', { n: fmt(bytes) });
}

/** A Projects stage or task status NAME → chip. An unknown name shows as sent, neutral. */
const STATUS_CHIPS: Readonly<Record<string, { key: CatalogKey; tone: StatusBadgeTone }>> = {
  Locked: { key: 'cportal.status.Locked', tone: 'neutral' },
  Open: { key: 'cportal.status.Open', tone: 'info' },
  Active: { key: 'cportal.status.Active', tone: 'info' },
  InProgress: { key: 'cportal.status.InProgress', tone: 'info' },
  Completed: { key: 'cportal.status.Completed', tone: 'success' },
  PendingApproval: { key: 'cportal.status.PendingApproval', tone: 'pending' },
  Rejected: { key: 'cportal.status.Rejected', tone: 'warning' },
  Cancelled: { key: 'cportal.status.Cancelled', tone: 'neutral' },
};

export function statusChip(
  status: string,
  catalog: CatalogService,
): { label: string; tone: StatusBadgeTone } {
  const chip = STATUS_CHIPS[status];
  return chip
    ? { label: catalog.t(chip.key), tone: chip.tone }
    : { label: status || '—', tone: 'neutral' };
}

/** Hands a blob to the browser as a download (the documents tab's pattern). */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Object URLs for authed image blobs, one per key, fetched once and revoked when the owning
 * component is destroyed. A plain `<img src>` would not carry the bearer token. Provide it on the
 * component that shows the images.
 */
@Injectable()
export class PortalBlobUrls {
  private readonly urls = signal<ReadonlyMap<string, string>>(new Map());
  private readonly failed = signal<ReadonlySet<string>>(new Set());
  private readonly requested = new Set<string>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const url of this.urls().values()) URL.revokeObjectURL(url);
    });
  }

  url(key: string): string | null {
    return this.urls().get(key) ?? null;
  }

  hasFailed(key: string): boolean {
    return this.failed().has(key);
  }

  /** Fetch once per key; a failure is remembered (no retry loop) and shown as a placeholder. */
  ensure(key: string, fetch: () => Observable<Blob>): void {
    if (this.requested.has(key)) return;
    this.requested.add(key);
    fetch().subscribe({
      next: (blob) => this.urls.update((m) => new Map(m).set(key, URL.createObjectURL(blob))),
      error: () => this.failed.update((s) => new Set(s).add(key)),
    });
  }
}
