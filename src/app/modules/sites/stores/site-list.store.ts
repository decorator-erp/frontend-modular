import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { ProjectService, type Project } from '@modules/projects';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { SiteService } from '../data/site.service';
import { canCreateSurvey } from '../model/site-capabilities';
import { SiteStatus } from '../model/site-enums';
import type { SitePage } from '../model/site.model';

export const SITE_PAGE_SIZE = 25;
const PROJECT_PAGE_SIZE = 200;
const STATUSES = [SiteStatus.Draft, SiteStatus.Submitted, SiteStatus.Approved, SiteStatus.Rejected];

/**
 * sites S-2: the survey list. The project picker holds every project the caller has a level on
 * (`GET /api/projects` pages of 200; each row carries `myLevel`, contract §2.17.2). The list pages on
 * `pageIndex`, newest first; the per-status counts are four `pageSize=1` reads (DEVIATION-S4).
 */
@Injectable()
export class SiteListStore {
  private readonly projectsApi = inject(ProjectService);
  private readonly api = inject(SiteService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly catalog = inject(CatalogService);
  private readonly permissions = inject(PermissionsService);

  readonly projects = signal<Project[]>([]);
  readonly projectsLoading = signal(false);
  readonly projectsError = signal<string | null>(null);

  readonly projectId = signal<string | null>(null);
  readonly status = signal<SiteStatus | null>(null);
  readonly pageIndex = signal(1);

  readonly page = signal<SitePage | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Per status int; `all` is their sum. Null while loading or when a count read failed. */
  readonly counts = signal<Record<number, number> | null>(null);

  readonly project = computed(() => this.projects().find((p) => p.id === this.projectId()) ?? null);
  readonly canCreate = computed(() =>
    canCreateSurvey(this.project(), (p) => this.permissions.can(p)),
  );
  /** Projects offered by the create modal: Editor+ and open. */
  readonly creatableProjects = computed(() =>
    this.projects().filter((p) => canCreateSurvey(p, (x) => this.permissions.can(x))),
  );
  readonly totalAll = computed(() => {
    const c = this.counts();
    return c ? STATUSES.reduce((sum, s) => sum + (c[s] ?? 0), 0) : null;
  });

  private generation = 0;

  /** Load every reachable project, then select `initial` when listed, else the first. */
  /**
   * `initial` (and its `status` / `pageIndex`) come from the URL (A10); they apply only when that
   * project is listed, otherwise the first project opens on All, page 1.
   */
  loadProjects(
    initial: string | null,
    initialStatus: SiteStatus | null = null,
    initialPage = 1,
  ): void {
    this.projectsLoading.set(true);
    this.projectsError.set(null);
    this.projectsApi
      .getAll(1, PROJECT_PAGE_SIZE)
      .pipe(
        switchMap((first) => {
          const rest = Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, i) =>
            this.projectsApi.getAll(i + 2, PROJECT_PAGE_SIZE).pipe(map((p) => p.items)),
          );
          return rest.length
            ? forkJoin(rest).pipe(map((pages) => [...first.items, ...pages.flat()]))
            : of(first.items);
        }),
      )
      .subscribe({
        next: (all) => {
          // Every row the caller can list carries a level (GET /api/projects is scoped).
          const projects = all.filter((p) => !!p.myLevel);
          this.projects.set(projects);
          this.projectsLoading.set(false);
          const asked = projects.find((p) => p.id === initial);
          if (asked) this.select(asked.id, initialStatus, initialPage);
          else this.select(projects[0]?.id ?? null);
        },
        error: (err: unknown) => {
          this.projectsLoading.set(false);
          this.projectsError.set(this.message(err, 'sv.projectsFailed'));
        },
      });
  }

  select(projectId: string | null, status: SiteStatus | null = null, pageIndex = 1): void {
    this.projectId.set(projectId);
    this.status.set(status);
    this.pageIndex.set(pageIndex);
    this.reload();
  }

  setStatus(status: SiteStatus | null): void {
    if (this.status() === status) return;
    this.status.set(status);
    this.pageIndex.set(1);
    this.loadPage();
  }

  setPage(pageIndex: number): void {
    this.pageIndex.set(pageIndex);
    this.loadPage();
  }

  /** The page and the counts. */
  reload(): void {
    this.loadPage();
    this.loadCounts();
  }

  /** After a create refusal that says the level or the project changed, re-read the projects. */
  refreshProjects(): void {
    this.loadProjects(this.projectId());
  }

  private loadPage(): void {
    const projectId = this.projectId();
    const gen = ++this.generation;
    this.error.set(null);
    if (!projectId) {
      this.page.set(null);
      return;
    }
    this.loading.set(true);
    this.api
      .list({
        projectId,
        status: this.status(),
        pageIndex: this.pageIndex(),
        pageSize: SITE_PAGE_SIZE,
      })
      .subscribe({
        next: (page) => {
          if (gen !== this.generation) return;
          this.page.set(page);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          if (gen !== this.generation) return;
          this.loading.set(false);
          this.page.set(null);
          this.error.set(this.message(err, 'sv.loadFailed'));
        },
      });
  }

  private countGen = 0;

  private loadCounts(): void {
    const projectId = this.projectId();
    const gen = ++this.countGen;
    this.counts.set(null);
    if (!projectId) return;
    forkJoin(
      STATUSES.map((status) =>
        this.api.list({ projectId, status, pageIndex: 1, pageSize: 1 }).pipe(
          map((p) => p.totalCount),
          catchError(() => of(null)),
        ),
      ),
    ).subscribe((totals) => {
      if (gen !== this.countGen) return;
      if (totals.some((t) => t === null)) return;
      const out: Record<number, number> = {};
      STATUSES.forEach((s, i) => (out[s] = totals[i] ?? 0));
      this.counts.set(out);
    });
  }

  private message(err: unknown, fallback: 'sv.loadFailed' | 'sv.projectsFailed'): string {
    return err instanceof HttpErrorResponse
      ? friendly(this.errors.parse(err))
      : this.catalog.t(fallback);
  }
}
