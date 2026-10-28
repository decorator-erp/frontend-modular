import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { ApprovalState } from '../model/crm-enums';
import type {
  AddRequirementItemRequest,
  ClientAddRequirementItemRequest,
  RequirementItem,
  UpdateRequirementItemRequest,
} from '../model';

/**
 * Requirement items — `/api/crm/projects/{projectId}/requirement-items` (office) and
 * `/api/crm/portal/requirement-items` (client). `crm.items.create/update/send/supersede` on office mutations,
 * `crm.items.read` to search, `crm.portal` on the client's own add.
 */
@Injectable({ providedIn: 'root' })
export class CrmItemService extends ApiService {
  /** `POST /` → `201` with a bare `Guid`. Lands `Draft` — sending for approval is a later action. */
  create(projectId: string, request: AddRequirementItemRequest): Observable<string> {
    return this.post<unknown>(`/crm/projects/${projectId}/requirement-items`, {
      periodId: request.periodId,
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
    } satisfies Record<string, unknown>).pipe(map((r) => this.unwrap<string>(r)));
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
   * `GET /?category&room&status&skip&take` — a bare array, no `PagedResult` wrapper
   * (the endpoint reports no `totalCount`).
   */
  search(
    projectId: string,
    options?: {
      category?: number;
      room?: string;
      status?: ApprovalState;
      skip?: number;
      take?: number;
    },
  ): Observable<RequirementItem[]> {
    return this.get<unknown>(`/crm/projects/${projectId}/requirement-items`, {
      category: options?.category,
      room: options?.room,
      status: options?.status,
      skip: options?.skip ?? 0,
      take: options?.take ?? 100,
    }).pipe(map((r) => this.unwrapArray<unknown>(r).map((i) => this.normalize(i))));
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
      createdAtUtc: this.field<string>(source, 'createdAtUtc') ?? '',
    };
  }
}

/** `authoredByClient` is derived, never on the wire — exactly one author FK is set. */
export function isClientAuthoredItem(item: RequirementItem): boolean {
  return item.createdByContactId !== null;
}
