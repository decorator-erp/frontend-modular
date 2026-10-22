import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ClientResponse, CreateClientRequest, UpdateClientRequest } from '../model/client.model';
import { AuthStore } from '@platform/auth/auth.store';
import { ApiService, readField } from '@platform/http/api.service';

/**
 * Wire → `ClientResponse`. Shared: `ClientService` and `shared/api/client-search.service.ts`
 * read the same rows off different endpoints and must normalize them identically.
 */
export function normalizeClient(source: unknown): ClientResponse {
  return {
    id: readField<string>(source, 'id', 'clientId') ?? '',
    firstName: readField<string>(source, 'firstName') ?? '',
    lastName: readField<string>(source, 'lastName') ?? '',
    email: readField<string>(source, 'email') ?? '',
    userName: readField<string>(source, 'userName', 'username') ?? '',
    isActive: readField<boolean>(source, 'isActive') ?? false,
    phoneNumber: readField<string | null>(source, 'phoneNumber', 'phone') ?? null,
    address: readField<string | null>(source, 'address') ?? null,
    notes: readField<string | null>(source, 'notes') ?? null,
  };
}

@Injectable({ providedIn: 'root' })
export class ClientService extends ApiService {
  private readonly auth = inject(AuthStore);
  private get uid(): string {
    return this.auth.user()?.userId ?? '';
  }
  getAll(): Observable<ClientResponse[]> {
    return this.get<unknown>('/clients').pipe(
      map((response) => this.unwrapArray(response).map((client) => normalizeClient(client))),
    );
  }

  getById(id: string): Observable<ClientResponse> {
    return this.get<unknown>(`/clients/${id}`).pipe(
      map((response) => normalizeClient(this.unwrap(response))),
    );
  }

  create(req: CreateClientRequest): Observable<string> {
    return this.post<unknown>('/clients', req).pipe(
      map((response) => this.unwrap<string>(response)),
    );
  }

  update(id: string, req: UpdateClientRequest): Observable<unknown> {
    return this.put(`/clients/${id}`, req);
  }
  activate(id: string): Observable<unknown> {
    return this.put(`/clients/${id}/activate`, {});
  }
  deactivate(id: string): Observable<unknown> {
    return this.put(`/clients/${id}/deactivate?userId=${this.uid}`, {});
  }
  deleteClient(id: string): Observable<unknown> {
    return this.delete(`/clients/${id}?userId=${this.uid}`);
  }
}
