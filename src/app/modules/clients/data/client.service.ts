import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ClientResponse, CreateClientRequest, UpdateClientRequest } from '../model/client.model';
import { ApiService, readField } from '@platform/http/api.service';

/**
 * Wire → `ClientResponse`. Shared: `ClientService` and `shared/api/client-search.service.ts`
 * read the same rows off different endpoints and must normalize them identically.
 */
export function normalizeClient(source: unknown): ClientResponse {
  return {
    id: readField<string>(source, 'id', 'clientId') ?? '',
    // crm-prod M8: `ClientListItemResponse` (ClientContracts.cs:85-87) carries one `displayName`,
    // no first/last name. It lands in `firstName` so every `${firstName} ${lastName}` label reads it.
    firstName:
      readField<string>(source, 'firstName') ?? readField<string>(source, 'displayName') ?? '',
    lastName: readField<string>(source, 'lastName') ?? '',
    email: readField<string>(source, 'email') ?? '',
    userName: readField<string>(source, 'userName', 'username') ?? '',
    isActive: readField<boolean>(source, 'isActive') ?? false,
    phoneNumber: readField<string | null>(source, 'phoneNumber', 'phone') ?? null,
    address: readField<string | null>(source, 'address') ?? null,
    notes: readField<string | null>(source, 'notes') ?? null,
  };
}

/**
 * Clients live in the CRM backend module: `/api/clients` (Crm.Infrastructure `ClientEndpoints.cs`).
 * The actor comes from the token on every write — no `userId` goes on the wire.
 */
@Injectable({ providedIn: 'root' })
export class ClientService extends ApiService {
  /**
   * `GET /api/clients?isActive=all&pageNumber=1&pageSize=200` (ClientEndpoints.cs:126-147): the first
   * 200 clients the caller can see, active and inactive (a bare `/clients` lists active ones only).
   */
  getAll(): Observable<ClientResponse[]> {
    return this.get<unknown>('/clients', { isActive: 'all', pageNumber: 1, pageSize: 200 }).pipe(
      map((response) => this.unwrapArray(response).map((client) => normalizeClient(client))),
    );
  }

  getById(id: string): Observable<ClientResponse> {
    return this.get<unknown>(`/clients/${id}`).pipe(
      map((response) => normalizeClient(this.unwrap(response))),
    );
  }

  /**
   * `POST /api/clients` — `CreateClientCommand { email, password, firstName, lastName, address,
   * phoneNumber?, notes? }` → `201 { clientId }` (ClientContracts.cs:36-43, ClientEndpoints.cs:26-31).
   * `userName` has no backend field and is not sent.
   */
  create(req: CreateClientRequest): Observable<string> {
    const body = {
      email: req.email,
      password: req.password,
      firstName: req.firstName,
      lastName: req.lastName,
      address: req.address,
      phoneNumber: req.phone || null,
      notes: req.notes ?? null,
    };
    return this.post<unknown>('/clients', body).pipe(
      map((response) => this.unwrapId(response, 'clientId')),
    );
  }

  /** `PUT /api/clients/{id}/profile` → 204 (ClientEndpoints.cs:33-45). */
  update(id: string, req: UpdateClientRequest): Observable<unknown> {
    return this.put(`/clients/${id}/profile`, {
      jobTitle: req.jobTitle,
      maritalStatus: req.maritalStatus,
      representativeName: req.representativeName,
    });
  }
  /** `PUT /api/clients/{id}/active` with `SetActiveRequest { isActive: true }` → 204 (ClientEndpoints.cs:47-58). */
  activate(id: string): Observable<unknown> {
    return this.put(`/clients/${id}/active`, { isActive: true });
  }
  /** `PUT /api/clients/{id}/active` with `SetActiveRequest { isActive: false }` → 204 (ClientEndpoints.cs:47-58). */
  deactivate(id: string): Observable<unknown> {
    return this.put(`/clients/${id}/active`, { isActive: false });
  }
  /** `DELETE /api/clients/{id}` → 204 (ClientEndpoints.cs:60-71). */
  deleteClient(id: string): Observable<unknown> {
    return this.delete(`/clients/${id}`);
  }
}
