import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
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
  createdAtUtc: string;
  /** The 1:1 qualification intake, or `null` when none has been saved yet. */
  intake?: LeadIntakeResponse | null;
}

/** Mirrors `LeadListItemResponse` — the search-result row (no `notes`, no conversion fields). */
export interface CrmLeadListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  source: LeadSource;
  ownerId: string;
  createdAtUtc: string;
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
   * `GET /?status&skip&take` — a raw `skip`/`take` slice, NOT the app's `PagedResult`
   * contract: the endpoint returns a bare array with no `totalCount`. Do not force it
   * into `PagedResult` — there is nothing to normalize.
   */
  search(options?: {
    status?: LeadStatus;
    skip?: number;
    take?: number;
  }): Observable<CrmLeadListItem[]> {
    return this.get<unknown>('/crm/leads', {
      status: options?.status,
      skip: options?.skip ?? 0,
      take: options?.take ?? 50,
    }).pipe(map((r) => this.unwrapArray<unknown>(r).map((l) => this.normalizeListItem(l))));
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
      createdAtUtc: this.field<string>(source, 'createdAtUtc') ?? '',
      // The intake round-trips as-is (its own nullable fields); no per-field normalization.
      intake: this.field<LeadIntakeResponse | null>(source, 'intake') ?? null,
    };
  }

  private normalizeListItem(source: unknown): CrmLeadListItem {
    return {
      id: this.field<string>(source, 'id') ?? '',
      firstName: this.field<string>(source, 'firstName') ?? '',
      lastName: this.field<string>(source, 'lastName') ?? '',
      email: this.field<string | null>(source, 'email') ?? null,
      phone: this.field<string | null>(source, 'phone') ?? null,
      status: this.field<number>(source, 'status') ?? LeadStatus.New,
      source: this.field<number>(source, 'source') ?? LeadSource.Other,
      ownerId: this.field<string>(source, 'ownerId') ?? '',
      createdAtUtc: this.field<string>(source, 'createdAtUtc') ?? '',
    };
  }
}
