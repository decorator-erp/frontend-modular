import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuditPagedResult, AuditQueryParams, AuditLogResponse } from '../model/audit.model';
import { ApiService } from '@platform/http/api.service';

@Injectable({ providedIn: 'root' })
export class AuditService extends ApiService {
  getLogs(params: AuditQueryParams = {}): Observable<AuditPagedResult> {
    return this.get<unknown>('/audit', { ...params }).pipe(
      map((response) => this.normalizePagedAudit(response)),
    );
  }

  getEntityHistory(entityName: string, entityId: string): Observable<AuditLogResponse[]> {
    return this.get<unknown>(`/audit/entity/${entityName}/${entityId}`).pipe(
      map((response) => this.unwrapArray(response).map((entry) => this.normalizeAudit(entry))),
    );
  }

  getMyActivity(): Observable<AuditLogResponse[]> {
    return this.get<unknown>('/audit/my-activity').pipe(
      map((response) => this.unwrapArray(response).map((entry) => this.normalizeAudit(entry))),
    );
  }

  getUserActivity(userId: string): Observable<AuditLogResponse[]> {
    return this.get<unknown>(`/audit/user/${userId}`).pipe(
      map((response) => this.unwrapArray(response).map((entry) => this.normalizeAudit(entry))),
    );
  }

  private normalizePagedAudit(response: unknown): AuditPagedResult {
    const value = this.unwrap<Record<string, unknown>>(response);
    const items = this.unwrapArray(this.field<unknown>(value, 'items') ?? value).map((entry) =>
      this.normalizeAudit(entry),
    );
    return {
      items,
      totalCount: this.field<number>(value, 'totalCount') ?? items.length,
      page: this.field<number>(value, 'page') ?? 1,
      pageSize: this.field<number>(value, 'pageSize') ?? items.length,
      totalPages: this.field<number>(value, 'totalPages') ?? 1,
    };
  }

  private normalizeAudit(source: unknown): AuditLogResponse {
    return {
      id: this.field<string>(source, 'id') ?? '',
      userId: this.field<string | null>(source, 'userId') ?? null,
      userName: this.field<string | null>(source, 'userName', 'username') ?? null,
      userEmail: this.field<string | null>(source, 'userEmail') ?? null,
      ipAddress: this.field<string | null>(source, 'ipAddress') ?? null,
      action: this.field<string>(source, 'action') ?? '',
      entityName: this.field<string>(source, 'entityName') ?? '',
      entityId: this.field<string | null>(source, 'entityId') ?? null,
      module: this.field<string | null>(source, 'module') ?? null,
      description: this.field<string | null>(source, 'description') ?? null,
      outcome: this.field<string>(source, 'outcome') ?? '',
      failureReason: this.field<string | null>(source, 'failureReason') ?? null,
      oldValues: this.field<string | null>(source, 'oldValues') ?? null,
      newValues: this.field<string | null>(source, 'newValues') ?? null,
      changedColumns: this.field<string | null>(source, 'changedColumns') ?? null,
      requestPath: this.field<string | null>(source, 'requestPath') ?? null,
      requestMethod: this.field<string | null>(source, 'requestMethod') ?? null,
      durationMs: this.field<number | null>(source, 'durationMs') ?? null,
      timestamp: this.field<string>(source, 'timestamp') ?? '',
    };
  }
}
