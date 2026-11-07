import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';

/** CRM counts for one assigned gathering task — mirrors `CrmTaskBlock` (01-Models §12). */
export interface CrmTaskBlock {
  briefId: string | null;
  briefStatus: number | null; // ApprovalState
  entryTotal: number;
  entryPending: number;
  itemTotal: number;
  itemPending: number;
  unresolvedTotal: number;
  meetingsUpcoming: number;
}

/** One row of the logged-in employee's assigned gathering work — mirrors `MyGatheringWorkItem`. */
export interface MyGatheringWorkItem {
  projectTaskId: string;
  taskName: string;
  projectId: string;
  projectName: string;
  projectStageId: string | null;
  stageName: string | null;
  taskBlock: CrmTaskBlock;
  openPeriodClosesAtUtc: string | null;
  nextMeetingAtUtc: string | null;
  /** Render-only `@for` key — synthetic when the server omitted `projectTaskId`. Never send it. */
  trackKey: string;
}

/** The server returns at most this many rows (`GetMyGatheringWorkQueryHandler.MaxTasks`). */
export const MY_GATHERING_WORK_CAP = 200;

/**
 * `GET /api/crm/my-gathering-work` (`CrmMyWorkEndpoints.cs:19`, `crm.briefs.read`;
 * `MyGatheringWorkItemResponse`, `MyWorkContracts.cs`) — the logged-in employee's open
 * assigned tasks that carry gathering work, at most 200 (a full 200 may mean more). A
 * non-employee gets 403 `crm.mywork.NotAnEmployee`, which is `handled(403)`: the page shows
 * its catalog message.
 */
@Injectable({ providedIn: 'root' })
export class CrmMyGatheringWorkService extends ApiService {
  list(): Observable<MyGatheringWorkItem[]> {
    return this.get<unknown>('/crm/my-gathering-work', undefined, { context: handled(403) }).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((i) => this.normalize(i))),
    );
  }

  private normalize(source: unknown): MyGatheringWorkItem {
    return {
      projectTaskId: this.field<string>(source, 'projectTaskId') ?? '',
      taskName: this.field<string>(source, 'taskName') ?? '',
      projectId: this.field<string>(source, 'projectId') ?? '',
      projectName: this.field<string>(source, 'projectName') ?? '',
      projectStageId: this.field<string | null>(source, 'projectStageId') ?? null,
      stageName: this.field<string | null>(source, 'stageName') ?? null,
      taskBlock: this.normalizeBlock(this.field<unknown>(source, 'taskBlock')),
      openPeriodClosesAtUtc: this.field<string | null>(source, 'openPeriodClosesAtUtc') ?? null,
      nextMeetingAtUtc: this.field<string | null>(source, 'nextMeetingAtUtc') ?? null,
      trackKey: this.trackKeyFor(source, 'MyGatheringWorkItem.projectTaskId', 'projectTaskId'),
    };
  }

  private normalizeBlock(source: unknown): CrmTaskBlock {
    return {
      briefId: this.field<string | null>(source, 'briefId') ?? null,
      briefStatus: this.field<number | null>(source, 'briefStatus') ?? null,
      entryTotal: this.field<number>(source, 'entryTotal') ?? 0,
      entryPending: this.field<number>(source, 'entryPending') ?? 0,
      itemTotal: this.field<number>(source, 'itemTotal') ?? 0,
      itemPending: this.field<number>(source, 'itemPending') ?? 0,
      unresolvedTotal: this.field<number>(source, 'unresolvedTotal') ?? 0,
      meetingsUpcoming: this.field<number>(source, 'meetingsUpcoming') ?? 0,
    };
  }
}
