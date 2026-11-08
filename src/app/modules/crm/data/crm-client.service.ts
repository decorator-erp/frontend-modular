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

  /**
   * Sync F4b: `POST /api/clients/{id}/children { gender: 'M'|'F', age }` → `201 { childId }`
   * (ClientEndpoints.cs:73, `clients.manage_children`). Age 0–120 (`crm.client_children.InvalidAge`).
   */
  addChild(clientId: string, child: { gender: 'M' | 'F'; age: number }): Observable<string> {
    return this.post<unknown>(`/clients/${clientId}/children`, {
      gender: child.gender,
      age: child.age,
    }).pipe(map((r) => this.unwrapId(r, 'childId')));
  }

  /** Sync F4b: `PUT /api/clients/{id}/children/{childId} { gender, age }` → 204 (ClientEndpoints.cs:86). */
  updateChild(
    clientId: string,
    childId: string,
    child: { gender: 'M' | 'F'; age: number },
  ): Observable<unknown> {
    return this.put(`/clients/${clientId}/children/${childId}`, {
      gender: child.gender,
      age: child.age,
    });
  }

  /** Sync F4b: `DELETE /api/clients/{id}/children/{childId}` → 204 (ClientEndpoints.cs:100). */
  removeChild(clientId: string, childId: string): Observable<unknown> {
    return this.delete(`/clients/${clientId}/children/${childId}`);
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
