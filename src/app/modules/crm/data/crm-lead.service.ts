import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import type { PagedResult } from '@platform/types';
import { LeadSource, LeadStatus } from '../model/crm-enums';
import type { LeadIntakeRequest, LeadIntakeResponse } from '../model';

/** Mirrors `LeadResponse` — the full lead record. */
export interface CrmLead {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  status: LeadStatus;
  ownerId: string;
  notes: string | null;
  convertedClientId: string | null;
  convertedAtUtc: string | null;
  /** The 1:1 qualification intake, or `null` when none has been saved yet. */
  intake?: LeadIntakeResponse | null;
}

/**
 * `GET /api/crm/leads` filters (009b #1). Every filter is server-side; `search` is a
 * case-insensitive contains-match on first name, last name, email and phone.
 */
export interface CrmLeadSearchOptions {
  pageNumber?: number;
  pageSize?: number;
  status?: LeadStatus;
  ownerId?: string;
  search?: string;
}

export interface CreateLeadRequest {
  firstName: string;
  lastName: string;
  source: LeadSource;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  ownerId?: string | null;
}

export interface UpdateLeadRequest {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  ownerId?: string | null;
}

/** Leads are converted through the dedicated `convert` action, never a status change. */
export interface ConvertLeadRequest {
  /** An existing client to attach this lead to, or `null` to create a new one. */
  existingClientId?: string | null;
  address?: string | null;
  notes?: string | null;
}

/**
 * Leads — `/api/crm/leads`. `crm.leads.create/update` on every mutation, `crm.leads.read` on reads.
 */
@Injectable({ providedIn: 'root' })
export class CrmLeadService extends ApiService {
  /** `POST /` → `201` with a bare `Guid`. */
  create(request: CreateLeadRequest): Observable<string> {
    return this.post<unknown>('/crm/leads', request).pipe(map((r) => this.unwrap<string>(r)));
  }

  /** `PUT /{id}` → `204`. */
  update(id: string, request: UpdateLeadRequest): Observable<void> {
    return this.put<void>(`/crm/leads/${id}`, request);
  }

  /** `PUT /{id}/status` → `204`. */
  updateStatus(id: string, status: LeadStatus): Observable<void> {
    return this.put<void>(`/crm/leads/${id}/status`, { status });
  }

  /**
   * `PUT /{id}/intake` → `204`. Upserts the 1:1 qualification row. Blocked once the
   * lead is `Converted` (`crm.leads.AlreadyConverted`). Sector/designer rules are
   * enforced server-side and mirrored by the shared intake validators.
   */
  upsertIntake(id: string, request: LeadIntakeRequest): Observable<void> {
    return this.put<void>(`/crm/leads/${id}/intake`, request);
  }

  /**
   * `POST /{id}/convert` → `204`. `crm.leads.InvalidStatusTransition` guards against
   * converting via `updateStatus` instead — this is the only path.
   */
  convert(id: string, request: ConvertLeadRequest): Observable<void> {
    return this.post<void>(`/crm/leads/${id}/convert`, {
      existingClientId: request.existingClientId ?? null,
      address: request.address ?? null,
      notes: request.notes ?? null,
    });
  }

  /** `GET /{id}` — the full record. */
  getById(id: string): Observable<CrmLead> {
    return this.get<unknown>(`/crm/leads/${id}`).pipe(
      map((r) => this.normalizeLead(this.unwrap(r))),
    );
  }

  /**
   * `GET /?pageNumber&pageSize&status&ownerId&search` → `PagedResult<CrmLeadResponse>`
   * (`CrmLeadEndpoints.cs:93-100`), newest created first. Default page 1 of 50.
   */
  search(options?: CrmLeadSearchOptions): Observable<PagedResult<CrmLead>> {
    const pageSize = options?.pageSize ?? 50;
    return this.get<unknown>('/crm/leads', {
      pageNumber: options?.pageNumber ?? 1,
      pageSize,
      status: options?.status,
      ownerId: options?.ownerId,
      search: options?.search?.trim(),
    }).pipe(map((r) => this.normalizePage(r, pageSize)));
  }

  private normalizePage(response: unknown, requestedPageSize: number): PagedResult<CrmLead> {
    const page = this.unwrap(response);
    const items = this.unwrapArray<unknown>(page).map((l) => this.normalizeLead(l));
    const pageSize = this.field<number>(page, 'pageSize') ?? requestedPageSize;
    const totalCount = this.field<number>(page, 'totalCount') ?? items.length;
    return {
      items,
      totalCount,
      page: this.field<number>(page, 'pageNumber') ?? 1,
      pageSize,
      totalPages:
        this.field<number>(page, 'totalPages') ??
        (pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0),
    };
  }

  private normalizeLead(source: unknown): CrmLead {
    return {
      id: this.field<string>(source, 'id') ?? '',
      firstName: this.field<string>(source, 'firstName') ?? '',
      lastName: this.field<string>(source, 'lastName') ?? '',
      email: this.field<string | null>(source, 'email') ?? null,
      phone: this.field<string | null>(source, 'phone') ?? null,
      source: this.field<number>(source, 'source') ?? LeadSource.Other,
      status: this.field<number>(source, 'status') ?? LeadStatus.New,
      ownerId: this.field<string>(source, 'ownerId') ?? '',
      notes: this.field<string | null>(source, 'notes') ?? null,
      convertedClientId: this.field<string | null>(source, 'convertedClientId') ?? null,
      convertedAtUtc: this.field<string | null>(source, 'convertedAtUtc') ?? null,
      // The intake round-trips as-is (its own nullable fields); no per-field normalization.
      intake: this.field<LeadIntakeResponse | null>(source, 'intake') ?? null,
    };
  }
}
