import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { ContactRole } from '../model/crm-enums';

/** Mirrors `CrmContactResponse` (`ContactContracts.cs:5-7`): no `createdAtUtc` (009b #32). */
export interface CrmContact {
  id: string;
  clientId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  role: ContactRole;
  isPrimary: boolean;
  notes: string | null;
}

export interface AddContactRequest {
  firstName: string;
  lastName: string;
  role: ContactRole;
  isPrimary: boolean;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  notes?: string | null;
}

export interface UpdateContactRequest {
  firstName: string;
  lastName: string;
  role: ContactRole;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  notes?: string | null;
}

/**
 * Client contacts — `/api/crm/clients/{clientId}/contacts`. `crm.contacts.create/update` on
 * every mutation, `crm.contacts.read` on the list.
 *
 * **The one-primary rule (FR-021)** is enforced server-side: `SetPrimaryContactCommand`
 * un-marks whichever contact currently holds `isPrimary` when a new one is set — the
 * server never leaves two, or zero, primaries. The client-side warning-before-saving
 * that a new primary un-marks the current one (T041, out of this run's scope) is UX,
 * not correctness; correctness is the server's job.
 */
@Injectable({ providedIn: 'root' })
export class CrmContactService extends ApiService {
  /**
   * `POST /` → `201 { contactId }` (009b #32). A second primary racing this one is 409
   * `crm.contacts.ConcurrentPrimaryChange`.
   */
  add(clientId: string, request: AddContactRequest): Observable<string> {
    return this.post<unknown>(`/crm/clients/${clientId}/contacts`, request).pipe(
      map((r) => this.unwrapId(r, 'contactId')),
    );
  }

  /** `PUT /{contactId}` → `204`. Cannot change `isPrimary` here — use `setPrimary()`. */
  update(clientId: string, contactId: string, request: UpdateContactRequest): Observable<void> {
    return this.put<void>(`/crm/clients/${clientId}/contacts/${contactId}`, request);
  }

  /**
   * `PUT /{contactId}/primary` → `204`. A primary contact cannot be un-set directly, only
   * replaced by promoting another one. A concurrent primary change is 409
   * `crm.contacts.ConcurrentPrimaryChange` (contract §1.4): the caller reloads (X-3).
   */
  setPrimary(clientId: string, contactId: string): Observable<void> {
    return this.put<void>(`/crm/clients/${clientId}/contacts/${contactId}/primary`, {});
  }

  /** `GET /` — every contact for the client. Small, unpaged list. */
  getForClient(clientId: string): Observable<CrmContact[]> {
    return this.get<unknown>(`/crm/clients/${clientId}/contacts`).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((c) => this.normalize(c))),
    );
  }

  private normalize(source: unknown): CrmContact {
    return {
      id: this.field<string>(source, 'id') ?? '',
      clientId: this.field<string>(source, 'clientId') ?? '',
      firstName: this.field<string>(source, 'firstName') ?? '',
      lastName: this.field<string>(source, 'lastName') ?? '',
      email: this.field<string | null>(source, 'email') ?? null,
      phone: this.field<string | null>(source, 'phone') ?? null,
      mobile: this.field<string | null>(source, 'mobile') ?? null,
      role: this.field<number>(source, 'role') ?? ContactRole.Other,
      isPrimary: this.field<boolean>(source, 'isPrimary') ?? false,
      notes: this.field<string | null>(source, 'notes') ?? null,
    };
  }
}
