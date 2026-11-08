import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';

/** `ClientChildRequest(char Gender, short Age)` (ClientEndpoints.cs:160). */
export interface ClientChildBody {
  gender: 'M' | 'F';
  age: number;
}

/**
 * Sync F4b: a client's children — `/api/clients/{id}/children[/{childId}]` (dms ClientEndpoints.cs:73-111,
 * `clients.manage_children`). Gender `'M'`/`'F'`, age 0–120 (`crm.client_children.InvalidGender` /
 * `InvalidAge`). The children themselves are read on `ClientResponse.children`.
 */
@Injectable({ providedIn: 'root' })
export class CrmClientChildrenService extends ApiService {
  /** `POST /api/clients/{id}/children { gender, age }` → `201 { childId }`. */
  addChild(clientId: string, child: ClientChildBody): Observable<string> {
    return this.post<unknown>(`/clients/${clientId}/children`, {
      gender: child.gender,
      age: child.age,
    }).pipe(map((r) => this.unwrapId(r, 'childId')));
  }

  /** `PUT /api/clients/{id}/children/{childId} { gender, age }` → 204. */
  updateChild(clientId: string, childId: string, child: ClientChildBody): Observable<unknown> {
    return this.put(`/clients/${clientId}/children/${childId}`, {
      gender: child.gender,
      age: child.age,
    });
  }

  /** `DELETE /api/clients/{id}/children/{childId}` → 204. */
  removeChild(clientId: string, childId: string): Observable<unknown> {
    return this.delete(`/clients/${clientId}/children/${childId}`);
  }
}
