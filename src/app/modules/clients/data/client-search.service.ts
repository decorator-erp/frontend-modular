import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { ClientResponse } from '../model/client.model';
import { normalizeClient } from './client.service';
import { Paged } from '@platform/types/paged';

/**
 * Server-side client search — `GET /api/clients?search&isActive&pageNumber&pageSize`
 * (ClientEndpoints.cs:126-147; there is no `/clients/search`). `search` matches the address and the
 * representative's name. `isActive` omitted here means both, sent as `isActive=all` (the backend's
 * own default is active only).
 */
@Injectable({ providedIn: 'root' })
export class ClientSearchService extends ApiService {
  search(
    opts: { searchTerm?: string; isActive?: boolean; page?: number; pageSize?: number } = {},
  ): Observable<Paged<ClientResponse>> {
    const params: Record<string, unknown> = {
      pageNumber: opts.page ?? 1,
      pageSize: opts.pageSize ?? 20,
      isActive: opts.isActive === undefined ? 'all' : String(opts.isActive),
    };
    if (opts.searchTerm) params['search'] = opts.searchTerm;
    return this.get<unknown>('/clients', params).pipe(map((r) => this.normalizePaged(r)));
  }

  private normalizePaged(response: unknown): Paged<ClientResponse> {
    const value = this.unwrap<Record<string, unknown>>(response);
    const items = this.unwrapArray(this.field<unknown>(value, 'items') ?? value).map((c) =>
      normalizeClient(c),
    );
    return {
      items,
      totalCount: this.field<number>(value, 'totalCount') ?? items.length,
      pageIndex: this.field<number>(value, 'pageIndex', 'page', 'pageNumber') ?? 1,
      totalPages: this.field<number>(value, 'totalPages') ?? 1,
    };
  }
}
