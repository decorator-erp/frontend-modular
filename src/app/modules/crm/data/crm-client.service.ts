import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import type { CrmClient, CrmClientChild } from '../model';

/**
 * The CRM-side read of one client (009b #30, D-b). `modules/clients` (005) is left on its
 * old shape; the hub reads the live `ClientResponse` here instead.
 */
@Injectable({ providedIn: 'root' })
export class CrmClientService extends ApiService {
  /**
   * `GET /api/clients/{id}` (`ClientEndpoints.cs:113-124`, `crm.clients.read`). A client outside
   * the caller's scope, or an unknown id, is a 404 `crm.clients.NotFound` (contract §1.3).
   */
  getClient(id: string): Observable<CrmClient> {
    return this.get<unknown>(`/clients/${id}`).pipe(
      map((response) => this.normalize(this.unwrap(response))),
    );
  }

  private normalize(source: unknown): CrmClient {
    return {
      id: this.field<string>(source, 'id') ?? '',
      appUserId: this.field<string>(source, 'appUserId') ?? '',
      address: this.field<string>(source, 'address') ?? '',
      notes: this.field<string | null>(source, 'notes') ?? null,
      jobTitle: this.field<string | null>(source, 'jobTitle') ?? null,
      maritalStatus: this.field<string | null>(source, 'maritalStatus') ?? null,
      representativeName: this.field<string | null>(source, 'representativeName') ?? null,
      children: (this.field<unknown[]>(source, 'children') ?? []).map((child): CrmClientChild => ({
        id: this.field<string>(child, 'id') ?? '',
        gender: this.field<string>(child, 'gender') ?? '',
        age: this.field<number>(child, 'age') ?? 0,
      })),
      isActive: this.field<boolean>(source, 'isActive') ?? false,
    };
  }
}
