import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { PERM, PermissionsService } from '@platform/permissions';
import { CrmPortalContentService } from '../data/crm-portal-content.service';
import type { PortalOverview } from '../model/portal.model';

export type PortalClientTab = 'progress' | 'files' | 'gallery' | 'tasks' | 'updates';

/**
 * crmp P2-B: the client's overview of one of its projects (`GET /api/crm/portal/projects/{p}/overview`),
 * which says which portal sections are on. The profile shows a section tab only when its section is
 * on AND the caller holds the section's own code (files/gallery: `crm.portal.files.view_own`;
 * progress/tasks/updates: `crm.portal.progress.view_own`). Without the progress code the overview
 * itself is not readable, so no section tab shows. Provided by the client profile.
 */
@Injectable()
export class PortalOverviewStore {
  private readonly api = inject(CrmPortalContentService);
  private readonly permissions = inject(PermissionsService);

  readonly overview = signal<PortalOverview | null>(null);
  readonly loading = signal(false);
  /** `notFound` (not the caller's project), `forbidden`, or `error` (anything else). */
  readonly error = signal<'notFound' | 'forbidden' | 'error' | null>(null);
  private projectId: string | null = null;
  private generation = 0;

  readonly tabs = computed<PortalClientTab[]>(() => {
    const o = this.overview();
    if (!o) return [];
    const progress = this.permissions.can(PERM.crm.portalVisibility.progressViewOwn);
    const files = this.permissions.can(PERM.crm.portalVisibility.filesViewOwn);
    const s = o.sections;
    const tabs: PortalClientTab[] = [];
    if (progress && s.progress) tabs.push('progress');
    if (files && s.documents) tabs.push('files');
    if (files && (s.gallery || s.siteSurveys)) tabs.push('gallery');
    if (progress && s.tasks) tabs.push('tasks');
    if (progress && s.updates) tabs.push('updates');
    return tabs;
  });

  load(projectId: string): void {
    this.projectId = projectId;
    const gen = ++this.generation;
    this.overview.set(null);
    this.error.set(null);
    if (!this.permissions.can(PERM.crm.portalVisibility.progressViewOwn)) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.getOverview(projectId).subscribe({
      next: (o) => {
        if (gen !== this.generation) return;
        this.overview.set(o);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        if (gen !== this.generation) return;
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        this.error.set(status === 404 ? 'notFound' : status === 403 ? 'forbidden' : 'error');
        this.loading.set(false);
      },
    });
  }

  reload(): void {
    if (this.projectId) this.load(this.projectId);
  }
}
