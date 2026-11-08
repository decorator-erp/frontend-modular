import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
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
 * `crm.items.read` to search, `requirements.submit_own` on the client's own add
 * (`CrmPortalEndpoints.cs:70`).
 */
/** crmp C-1: filters and the page of the client's portal items. */
export interface PortalItemQuery {
  projectId?: string | null;
  periodId?: string | null;
  status?: ApprovalState | null;
  pageNumber: number;
  pageSize: number;
}

/** crmp C-1: `PortalRequirementItemResponse` (the fields the portal list shows). */
export interface PortalRequirementItem {
  id: string;
  projectId: string;
  projectName: string;
  periodId: string;
  title: string;
  description: string | null;
  room: string | null;
  approvalStatus: ApprovalState;
  submittedByMe: boolean;
  decisionComment: string | null;
  decidedAtUtc: string | null;
  createdAtUtc: string;
}

@Injectable({ providedIn: 'root' })
export class CrmItemService extends ApiService {
  private readonly periodsApi = inject(CrmPeriodService);

  /**
   * `POST /api/crm/periods/{periodId}/items` → `201 { itemId }` (009b #22). Lands `Draft` — sending
   * for approval is a later action. 404 `crm.periods.NotFound`; 409 `crm.periods.NotOpen` /
   * `crm.projects.Inactive`; 400 `crm.items.ProjectMismatch` / `UnknownSpaceType` / `InvalidSource`.
   */
  create(periodId: string, request: AddRequirementItemRequest): Observable<string> {
    return this.post<unknown>(
      `/crm/periods/${periodId}/items`,
      {
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
      } satisfies Record<string, unknown>,
      // FINDING-5-7: the form shows the 403's catalog message (`friendly()`).
      { context: handled(403) },
    ).pipe(map((r) => this.unwrapId(r, 'itemId')));
  }

  /**
   * `PUT /requirement-items/{itemId}` → `204`. Blocked once decided (`ItemLocked`/`NotPending`).
   * 409 `crm.items.ConcurrentUpdate` (reload, X-3), `crm.periods.NotOpen`, `crm.projects.Inactive`.
   */
  update(itemId: string, request: UpdateRequirementItemRequest): Observable<void> {
    return this.put<void>(`/crm/requirement-items/${itemId}`, this.toBody(request));
  }

  /**
   * `PUT /requirement-items/{itemId}/send` → `204`. Sends a Draft item for the client's confirmation.
   * A Closed period is 409 `crm.periods.NotOpen` (checked before `ItemLocked`); also 409
   * `crm.items.AlreadyPending` / `TooManyVoidedRounds` / `ConcurrentUpdate`, `crm.projects.Inactive`.
   */
  send(itemId: string): Observable<void> {
    return this.put<void>(`/crm/requirement-items/${itemId}/send`, {});
  }

  /**
   * `POST /requirement-items/{itemId}/supersede` → `201 { itemId }`, the NEW item's id (009b #24).
   * Only a locked (trusted) item can be superseded — the ledger rule, same as brief spaces.
   */
  supersede(itemId: string, request: UpdateRequirementItemRequest): Observable<string> {
    return this.post<unknown>(
      `/crm/requirement-items/${itemId}/supersede`,
      this.toBody(request),
      { context: handled(403) }, // FINDING-5-7: the caller shows the 403's catalog message.
    ).pipe(map((r) => this.unwrapId(r, 'itemId')));
  }

  /**
   * crmp C-1: the client's own items — `GET /api/crm/portal/requirement-items?projectId&periodId&status
   * &pageNumber&pageSize` → `PagedResult<PortalRequirementItemResponse>` (dms CrmPortalEndpoints.cs:61,
   * `requirements.view_own`; PortalContracts.cs:132). Newest first; a project or period that isn't the
   * client's is 404 `crm.portal.NotFound`, handled by the caller.
   */
  listPortal(query: PortalItemQuery): Observable<PagedResult<PortalRequirementItem>> {
    const params: Record<string, unknown> = {
      pageNumber: query.pageNumber,
      pageSize: query.pageSize,
    };
    if (query.projectId) params['projectId'] = query.projectId;
    if (query.periodId) params['periodId'] = query.periodId;
    if (query.status) params['status'] = query.status;
    // 403 until the client holds requirements.view_own (CrmPortalEndpoints.cs:61-68): shown inline.
    return this.get<unknown>('/crm/portal/requirement-items', params, {
      context: handled(403, 404),
    }).pipe(
      map((r) => {
        const v = this.unwrap(r);
        const items = this.unwrapArray(v).map((x) => ({
          id: this.field<string>(x, 'id') ?? '',
          projectId: this.field<string>(x, 'projectId') ?? '',
          projectName: this.field<string>(x, 'projectName') ?? '',
          periodId: this.field<string>(x, 'periodId') ?? '',
          title: this.field<string>(x, 'title') ?? '',
          description: this.field<string | null>(x, 'description') ?? null,
          room: this.field<string | null>(x, 'room') ?? null,
          approvalStatus: Number(this.field(x, 'approvalStatus') ?? 0) as ApprovalState,
          submittedByMe: this.field<boolean>(x, 'submittedByMe') ?? false,
          decisionComment: this.field<string | null>(x, 'decisionComment') ?? null,
          decidedAtUtc: this.field<string | null>(x, 'decidedAtUtc') ?? null,
          createdAtUtc: this.field<string>(x, 'createdAtUtc') ?? '',
        }));
        return {
          items,
          totalCount: this.field<number>(v, 'totalCount') ?? items.length,
          page: this.field<number>(v, 'pageNumber') ?? query.pageNumber,
          pageSize: this.field<number>(v, 'pageSize') ?? query.pageSize,
          totalPages: this.field<number>(v, 'totalPages') ?? 1,
        } as PagedResult<PortalRequirementItem>;
      }),
    );
  }

  /**
   * `POST /portal/requirement-items` → `201 { itemId }` (009b #46). Gated `requirements.submit_own`,
   * which is not in the client baseline (the entry is hidden without it). The client's own
   * item lands `NotRequired` (Trusted on arrival) — no source fields exist on this body at
   * all (FR-012): a client-authored item never cites a meeting/brief/note. 404 `crm.portal.NotFound`,
   * 409 `crm.periods.NotOpen`, 400 `crm.items.UnknownSpaceType` show their catalog message in the form.
   */
  portalCreate(request: ClientAddRequirementItemRequest): Observable<string> {
    return this.post<unknown>(
      '/crm/portal/requirement-items',
      {
        projectId: request.projectId,
        periodId: request.periodId,
        category: request.category,
        title: request.title,
        priority: request.priority,
        room: request.room ?? null,
        description: request.description ?? null,
      },
      { context: handled(403) }, // FINDING-5-7: the form shows the 403's catalog message.
    ).pipe(map((r) => this.unwrapId(r, 'itemId')));
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
      spaceTypeId: request.spaceTypeId ?? null,
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
