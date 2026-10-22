import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { ClientResponse } from '../model/client.model';
import { normalizeClient } from './client.service';
import { Paged } from '@platform/types/paged';

/** Server-side client search (`/clients/search`) — paged, term + status filters. */
@Injectable({ providedIn: 'root' })
export class ClientSearchService extends ApiService {
  search(
    opts: { searchTerm?: string; isActive?: boolean; page?: number; pageSize?: number } = {},
  ): Observable<Paged<ClientResponse>> {
    const params: Record<string, unknown> = {
      PageNumber: opts.page ?? 1,
      PageSize: opts.pageSize ?? 20,
    };
    if (opts.searchTerm) params['SearchTerm'] = opts.searchTerm;
    if (opts.isActive !== undefined) params['IsActive'] = opts.isActive;
    return this.get<unknown>('/clients/search', params).pipe(map((r) => this.normalizePaged(r)));
  }

  private normalizePaged(response: unknown): Paged<ClientResponse> {
    const value = this.unwrap<Record<string, unknown>>(response);
    const items = this.unwrapArray(this.field<unknown>(value, 'items') ?? value).map((c) =>
      normalizeClient(c),
    );
    return {
      items,
      totalCount: this.field<number>(value, 'totalCount') ?? items.length,
      pageIndex: this.field<number>(value, 'pageIndex', 'page') ?? 1,
      totalPages: this.field<number>(value, 'totalPages') ?? 1,
    };
  }
}
