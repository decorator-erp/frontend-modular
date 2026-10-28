import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { RequirementPeriodStatus } from '../model/crm-enums';

/**
 * The requirement period — mirrors `PeriodResponse` (`Application/DTOs/CrmPeriods`).
 *
 * A project holds AT MOST ONE open period at a time — `POST /periods` returns
 * `crm.periods.OpenPeriodExists` if one is already open — so `GET /periods` returns
 * the project's full history (closed periods included), not a single record.
 */
export interface CrmPeriod {
  id: string;
  projectId: string;
  projectStageId: string | null;
  status: RequirementPeriodStatus;
  closesAtUtc: string;
  closedAtUtc: string | null;
  closeNotifiedAtUtc: string | null;
  openedById: string;
  createdAtUtc: string;
}

/**
 * Requirement-period lifecycle — `/api/crm/projects/{id}/periods` and
 * `/api/crm/periods/{id}/*`. Permission `crm.periods.open/extend/close` on every mutation;
 * `crm.periods.read` on the list.
 */
@Injectable({ providedIn: 'root' })
export class CrmPeriodService extends ApiService {
  /**
   * `POST /api/crm/projects/{projectId}/periods` → `201` with a bare `Guid`.
   * `projectStageId` is optional — a stage-based project's period may anchor to a
   * specific stage; a free-style project passes `null`.
   */
  open(projectId: string, closesAtUtc: string, projectStageId?: string | null): Observable<string> {
    return this.post<unknown>(`/crm/projects/${projectId}/periods`, {
      projectStageId: projectStageId ?? null,
      closesAtUtc,
    }).pipe(map((r) => this.unwrap<string>(r)));
  }

  /** `GET /api/crm/projects/{projectId}/periods` — the project's full period history. */
  list(projectId: string): Observable<CrmPeriod[]> {
    return this.get<unknown>(`/crm/projects/${projectId}/periods`).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((p) => this.normalize(p))),
    );
  }

  /**
   * `PUT /api/crm/periods/{periodId}/extend` → `204`. Not scoped by project — the
   * period id is the resource id.
   */
  extend(periodId: string, newClosesAtUtc: string): Observable<void> {
    return this.put<void>(`/crm/periods/${periodId}/extend`, { newClosesAtUtc });
  }

  /** `PUT /api/crm/periods/{periodId}/close` → `204`. No body. */
  close(periodId: string): Observable<void> {
    return this.put<void>(`/crm/periods/${periodId}/close`, {});
  }

  private normalize(source: unknown): CrmPeriod {
    return {
      id: this.field<string>(source, 'id') ?? '',
      projectId: this.field<string>(source, 'projectId') ?? '',
      projectStageId: this.field<string | null>(source, 'projectStageId') ?? null,
      status: this.field<number>(source, 'status') ?? RequirementPeriodStatus.Open,
      closesAtUtc: this.field<string>(source, 'closesAtUtc') ?? '',
      closedAtUtc: this.field<string | null>(source, 'closedAtUtc') ?? null,
      closeNotifiedAtUtc: this.field<string | null>(source, 'closeNotifiedAtUtc') ?? null,
      openedById: this.field<string>(source, 'openedById') ?? '',
      createdAtUtc: this.field<string>(source, 'createdAtUtc') ?? '',
    };
  }
}
