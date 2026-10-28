import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import type { PagedResult } from '@platform/types';
import { ApprovalState } from '../model/crm-enums';
import type {
  AddRequirementItemRequest,
  ClientAddRequirementItemRequest,
  RequirementItem,
  UpdateRequirementItemRequest,
} from '../model';
import { CrmPeriodService } from './crm-period.service';

/** The backend's `pageSize` cap (`GetCrmRequirementItemsByPeriodQuery`: 1..200). */
const MAX_PAGE_SIZE = 200;

/**
 * Requirement items — `/api/crm/periods/{periodId}/items`, `/api/crm/project-tasks/{taskId}/requirement-items`
 * and `/api/crm/requirement-items/{itemId}` (office), `/api/crm/portal/requirement-items` (client). `crm.items.create/update/send/supersede` on office mutations,
 * `crm.items.read` to search, `crm.portal` on the client's own add.
 */
@Injectable({ providedIn: 'root' })
export class CrmItemService extends ApiService {
  private readonly periodsApi = inject(CrmPeriodService);

  /**
   * `POST /api/crm/periods/{periodId}/items` → `201 { itemId }` (009b #22). Lands `Draft` — sending
   * for approval is a later action. 404 `crm.periods.NotFound`; 409 `crm.periods.NotOpen` /
   * `crm.projects.Inactive`; 400 `crm.items.ProjectMismatch` / `UnknownSpaceType` / `InvalidSource`.
   */
  create(periodId: string, request: AddRequirementItemRequest): Observable<string> {
    return this.post<unknown>(`/crm/periods/${periodId}/items`, {
      projectId: request.projectId,
      category: request.category,
      title: request.title,
      priority: request.priority,
      spaceTypeId: request.spaceTypeId ?? null,
      room: request.room ?? null,
      description: request.description ?? null,
      sourceType: request.sourceType ?? null,
      meetingId: request.meetingId ?? null,
      briefId: request.briefId ?? null,
      noteId: request.noteId ?? null,
      projectTaskId: request.projectTaskId ?? null,
    } satisfies Record<string, unknown>).pipe(map((r) => this.unwrapId(r, 'itemId')));
  }

  /** `PUT /requirement-items/{itemId}` → `204`. Blocked once decided (`ItemLocked`/`NotPending`). */
  update(itemId: string, request: UpdateRequirementItemRequest): Observable<void> {
    return this.put<void>(`/crm/requirement-items/${itemId}`, this.toBody(request));
  }

  /** `PUT /requirement-items/{itemId}/send` → `204`. Sends a Draft item for the client's confirmation. */
  send(itemId: string): Observable<void> {
    return this.put<void>(`/crm/requirement-items/${itemId}/send`, {});
  }

  /**
   * `POST /requirement-items/{itemId}/supersede` → `201` with the NEW item's bare `Guid`.
   * Only a locked (trusted) item can be superseded — the ledger rule, same as brief spaces.
   */
  supersede(itemId: string, request: UpdateRequirementItemRequest): Observable<string> {
    return this.post<unknown>(
      `/crm/requirement-items/${itemId}/supersede`,
      this.toBody(request),
    ).pipe(map((r) => this.unwrap<string>(r)));
  }

  /**
   * `POST /portal/requirement-items` → `201` `Guid`. Gated `crm.portal`. The client's own
   * item lands `NotRequired` (Trusted on arrival) — no source fields exist on this body at
   * all (FR-012): a client-authored item never cites a meeting/brief/note.
   */
  portalCreate(request: ClientAddRequirementItemRequest): Observable<string> {
    return this.post<unknown>('/crm/portal/requirement-items', {
      projectId: request.projectId,
      periodId: request.periodId,
      category: request.category,
      title: request.title,
      priority: request.priority,
      room: request.room ?? null,
      description: request.description ?? null,
    }).pipe(map((r) => this.unwrap<string>(r)));
  }

  /** `GET /portal/projects/{projectId}/requirement-items` — the client's own items for one project. */
  portalSearch(projectId: string): Observable<RequirementItem[]> {
    return this.get<unknown>(`/crm/portal/projects/${projectId}/requirement-items`).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((i) => this.normalize(i))),
    );
  }

  /**
   * `GET /api/crm/periods/{periodId}/items?pageNumber&pageSize` → `PagedResult`, newest first, with no
   * category/room/status filter (009b #23) — filtering is the caller's, client-side.
   */
  listByPeriod(
    periodId: string,
    pageNumber = 1,
    pageSize = 50,
  ): Observable<PagedResult<RequirementItem>> {
    return this.get<unknown>(`/crm/periods/${periodId}/items`, { pageNumber, pageSize }).pipe(
      map((r) => this.normalizePage(r, pageSize)),
    );
  }

  /** `GET /api/crm/project-tasks/{taskId}/requirement-items?pageNumber&pageSize` — same shape (009b #23). */
  listByTask(
    taskId: string,
    pageNumber = 1,
    pageSize = 50,
  ): Observable<PagedResult<RequirementItem>> {
    return this.get<unknown>(`/crm/project-tasks/${taskId}/requirement-items`, {
      pageNumber,
      pageSize,
    }).pipe(map((r) => this.normalizePage(r, pageSize)));
  }

  /**
   * Every item of a project (009b #23): there is no project route, so this loads the project's
   * periods (`CrmPeriodService.list`, newest first) and then every page of each period's items.
   * The result keeps the server order: newest period first, newest item first within it.
   */
  listByProject(projectId: string): Observable<RequirementItem[]> {
    return this.periodsApi.list(projectId).pipe(
      switchMap((periods) =>
        periods.length ? forkJoin(periods.map((p) => this.listAllByPeriod(p.id))) : of([]),
      ),
      map((perPeriod) => perPeriod.flat()),
    );
  }

  /** Every page of one period's items, at the backend's largest page size. */
  private listAllByPeriod(periodId: string): Observable<RequirementItem[]> {
    return this.listByPeriod(periodId, 1, MAX_PAGE_SIZE).pipe(
      switchMap((first) => {
        if (first.totalPages <= 1) return of(first.items);
        const rest = Array.from({ length: first.totalPages - 1 }, (_, i) =>
          this.listByPeriod(periodId, i + 2, MAX_PAGE_SIZE),
        );
        return forkJoin(rest).pipe(
          map((pages) => [...first.items, ...pages.flatMap((page) => page.items)]),
        );
      }),
    );
  }

  /** The `PagedResult` envelope (`pageNumber` on the wire, `page` in the app). */
  private normalizePage(
    response: unknown,
    requestedPageSize: number,
  ): PagedResult<RequirementItem> {
    const page = this.unwrap(response);
    const items = this.unwrapArray<unknown>(page).map((i) => this.normalize(i));
    const pageSize = this.field<number>(page, 'pageSize') ?? requestedPageSize;
    const totalCount = this.field<number>(page, 'totalCount') ?? items.length;
    return {
      items,
      totalCount,
      page: this.field<number>(page, 'pageNumber') ?? 1,
      pageSize,
      totalPages:
        this.field<number>(page, 'totalPages') ?? (pageSize ? Math.ceil(totalCount / pageSize) : 1),
    };
  }

  private toBody(request: UpdateRequirementItemRequest): Record<string, unknown> {
    return {
      category: request.category,
      title: request.title,
      priority: request.priority,
      room: request.room ?? null,
      description: request.description ?? null,
      sourceType: request.sourceType ?? null,
      meetingId: request.meetingId ?? null,
      briefId: request.briefId ?? null,
      noteId: request.noteId ?? null,
      projectTaskId: request.projectTaskId ?? null,
    };
  }

  private normalize(source: unknown): RequirementItem {
    return {
      id: this.field<string>(source, 'id') ?? '',
      projectId: this.field<string>(source, 'projectId') ?? '',
      periodId: this.field<string>(source, 'periodId') ?? '',
      category: this.field<number>(source, 'category') ?? 0,
      spaceTypeId: this.field<string | null>(source, 'spaceTypeId') ?? null,
      room: this.field<string | null>(source, 'room') ?? null,
      title: this.field<string>(source, 'title') ?? '',
      details: this.field<string | null>(source, 'description') ?? null,
      priority: this.field<number>(source, 'priority') ?? 0,
      sourceType: this.field<number | null>(source, 'sourceType') ?? null,
      meetingId: this.field<string | null>(source, 'meetingId') ?? null,
      briefId: this.field<string | null>(source, 'briefId') ?? null,
      noteId: this.field<string | null>(source, 'noteId') ?? null,
      approvalStatus: this.field<number>(source, 'approvalStatus') ?? ApprovalState.Draft,
      supersedesItemId: this.field<string | null>(source, 'supersedesItemId') ?? null,
      createdByEmployeeId: this.field<string | null>(source, 'createdByEmployeeId') ?? null,
      createdByContactId: this.field<string | null>(source, 'createdByContactId') ?? null,
      projectTaskId: this.field<string | null>(source, 'projectTaskId') ?? null,
    };
  }
}

/** `authoredByClient` is derived, never on the wire — exactly one author FK is set. */
export function isClientAuthoredItem(item: RequirementItem): boolean {
  return item.createdByContactId !== null;
}
