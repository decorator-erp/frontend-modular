import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import type { PagedResult } from '@platform/types';
import { LeadSource, LeadStatus } from '../model/crm-enums';
import type {
  CrmClientOption,
  CrmLeadStatusCounts,
  LeadIntakeRequest,
  LeadIntakeResponse,
} from '../model';

/** Mirrors `LeadResponse` — the full lead record. */
export interface CrmLead {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  status: LeadStatus;
  /** LI-1: `null` for an unassigned lead — every lead from the public intake form starts so. */
  ownerId: string | null;
  notes: string | null;
  convertedClientId: string | null;
  convertedAtUtc: string | null;
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
  /** An active HR employee (400 `crm.leads.OwnerNotFound`), or `null` to leave the lead unassigned (LI-1). */
  ownerId: string | null;
}

/**
 * `UpdateLeadRequest(FirstName, LastName, Source, OwnerId, Email, Phone, Notes)`
 * (`CrmLeadEndpoints.cs:103-105`): a full replace — an omitted email/phone/notes is cleared.
 */
export interface UpdateLeadRequest {
  firstName: string;
  lastName: string;
  source: LeadSource;
  /** An active HR employee (400 `crm.leads.OwnerNotFound` when it changes), or `null` for unassigned (LI-1). */
  ownerId: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

/**
 * Leads are converted through the dedicated `convert` action, never a status change.
 * `ConvertRequest(Guid ExistingClientId)` (`CrmLeadEndpoints.cs:108`): the client is required;
 * "create a new client" is not supported (C §8.1.7).
 */
export interface ConvertLeadRequest {
  existingClientId: string;
}

/**
 * Leads — `/api/crm/leads`. `crm.leads.create/update` on every mutation, `crm.leads.read` on reads.
 */
@Injectable({ providedIn: 'root' })
export class CrmLeadService extends ApiService {
  /** `POST /` → `201 { leadId }` (`CrmLeadEndpoints.cs:26-31`). */
  create(request: CreateLeadRequest): Observable<string> {
    return this.post<unknown>('/crm/leads', request).pipe(map((r) => this.unwrapId(r, 'leadId')));
  }

  /**
   * `PUT /{id}` → `204` (`CrmLeadEndpoints.cs:33-40`). A full replace, so all 7 fields always
   * travel. 409 `crm.leads.AlreadyConverted` / `crm.leads.ConcurrentUpdate` (C §1.4) belong to
   * the caller: route a concurrency 409 through `injectReloadOnConflict()`.
   */
  update(id: string, request: UpdateLeadRequest): Observable<void> {
    return this.put<void>(`/crm/leads/${id}`, {
      firstName: request.firstName,
      lastName: request.lastName,
      source: request.source,
      ownerId: request.ownerId,
      email: request.email ?? null,
      phone: request.phone ?? null,
      notes: request.notes ?? null,
    });
  }

  /**
   * `PUT /{id}/status` → `204`. FINDING-P2-16: 403 is `handled` — `LeadDetailStore.changeStatus`
   * shows its localized catalog toast for every caller (FINDING-P2-24); 0 and 5xx stay with
   * `errorInterceptor`.
   */
  updateStatus(id: string, status: LeadStatus): Observable<void> {
    return this.put<void>(`/crm/leads/${id}/status`, { status }, { context: handled(403) });
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
   * `POST /{id}/convert { existingClientId }` → `200 { clientId }` (`CrmLeadEndpoints.cs:49-61`).
   * A client the caller can't see is 404 `crm.clients.NotFound` (D-9).
   * `crm.leads.InvalidStatusTransition` guards against converting via `updateStatus` instead —
   * this is the only path.
   */
  convert(id: string, request: ConvertLeadRequest): Observable<{ clientId: string }> {
    return this.post<unknown>(`/crm/leads/${id}/convert`, {
      existingClientId: request.existingClientId,
    }).pipe(map((r) => ({ clientId: this.unwrapId(r, 'clientId') })));
  }

  /**
   * `GET /{id}/intake` → `{ leadId, data }` (`CrmLeadEndpoints.cs:79-84`); `data` is empty when
   * no intake is saved yet. `CrmLeadResponse` carries no intake (009b #5).
   */
  getIntake(id: string): Observable<LeadIntakeResponse> {
    return this.get<unknown>(`/crm/leads/${id}/intake`).pipe(
      // The intake round-trips as-is (its own nullable fields); no per-field normalization.
      map((r) => this.field<LeadIntakeResponse | null>(this.unwrap(r), 'data') ?? {}),
    );
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

  /**
   * `GET /status-counts?ownerId&search` → one count per status (`CrmLeadEndpoints.cs:71-77`),
   * under the same owner and search filters as `search()` (009b #2).
   */
  statusCounts(options?: { ownerId?: string; search?: string }): Observable<CrmLeadStatusCounts> {
    return this.get<unknown>('/crm/leads/status-counts', {
      ownerId: options?.ownerId,
      search: options?.search?.trim(),
    }).pipe(
      map((r) => {
        const c = this.unwrap(r);
        const n = (key: string) => this.field<number>(c, key) ?? 0;
        return {
          total: n('total'),
          new: n('new'),
          contacted: n('contacted'),
          qualified: n('qualified'),
          unqualified: n('unqualified'),
          converted: n('converted'),
        };
      }),
    );
  }

  /**
   * The convert picker's client list (009b #31, D-c): `GET /api/clients?pageNumber&pageSize&search
   * &isActive=true` → `PagedResult<ClientListItemResponse>` (`ClientEndpoints.cs:126-156`). Only
   * clients the caller can see are listed; `search` matches address and representative name.
   * CRM-side so `modules/clients`' `ClientSearchService` (four consumers) stays untouched.
   */
  searchClients(options?: {
    pageNumber?: number;
    pageSize?: number;
    search?: string;
  }): Observable<PagedResult<CrmClientOption>> {
    const pageSize = options?.pageSize ?? 50;
    return this.get<unknown>('/clients', {
      pageNumber: options?.pageNumber ?? 1,
      pageSize,
      search: options?.search?.trim(),
      isActive: true,
    }).pipe(
      map((r) => {
        const page = this.unwrap(r);
        const items = this.unwrapArray<unknown>(page).map((c) => ({
          id: this.field<string>(c, 'id') ?? '',
          displayName: this.field<string | null>(c, 'displayName') ?? null,
          email: this.field<string | null>(c, 'email') ?? null,
        }));
        return this.pageOf(page, items, pageSize);
      }),
    );
  }

  private normalizePage(response: unknown, requestedPageSize: number): PagedResult<CrmLead> {
    const page = this.unwrap(response);
    const items = this.unwrapArray<unknown>(page).map((l) => this.normalizeLead(l));
    return this.pageOf(page, items, requestedPageSize);
  }

  /** The `PagedResult` envelope (`pageNumber` on the wire, `page` in the app) around `items`. */
  private pageOf<T>(page: unknown, items: T[], requestedPageSize: number): PagedResult<T> {
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
      ownerId: this.field<string | null>(source, 'ownerId') || null,
      notes: this.field<string | null>(source, 'notes') ?? null,
      convertedClientId: this.field<string | null>(source, 'convertedClientId') ?? null,
      convertedAtUtc: this.field<string | null>(source, 'convertedAtUtc') ?? null,
    };
  }
}
