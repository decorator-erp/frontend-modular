import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CreateInvoiceRequest, InvoiceResponse } from '../model/invoice.model';
import { InvoiceLineRequest } from '../model/invoice-line.model';
import { PagedResult } from '@platform/types';
import type { InvoiceStatus, InvoiceType } from '../model/enums';
import { ApiService } from '@platform/http/api.service';

/** Sync W1-11: the route filters by `status` only (InvoiceEndpoints.cs:65-66) — no `type`. */
export interface InvoiceQuery {
  status?: InvoiceStatus;
  pageNumber?: number;
  pageSize?: number;
}

/**
 * Invoices — `api-docs/11-finance.md` Section 4.
 *
 * Payment is recorded via `LedgerEntryService.allocate` (Section 3) — there
 * is no dedicated pay endpoint.
 */
@Injectable({ providedIn: 'root' })
export class InvoiceService extends ApiService {
  create(req: CreateInvoiceRequest): Observable<string> {
    // Backend uses numeric enum converter — translate `type` to its 1-based ordinal.
    const wire = { ...req, type: invoiceTypeWire(req.type) };
    return this.post<unknown>('/invoices', wire).pipe(map((r) => this.unwrap<string>(r)));
  }

  addLine(invoiceId: string, line: InvoiceLineRequest): Observable<string> {
    return this.post<unknown>(`/invoices/${invoiceId}/lines`, line).pipe(
      map((r) => this.unwrap<string>(r)),
    );
  }

  cancel(id: string): Observable<unknown> {
    return this.put(`/invoices/${id}/cancel`, {});
  }

  getById(id: string): Observable<InvoiceResponse> {
    return this.get<unknown>(`/invoices/${id}`).pipe(map((r) => this.unwrap<InvoiceResponse>(r)));
  }

  getByProject(
    projectId: string,
    query: InvoiceQuery = {},
  ): Observable<PagedResult<InvoiceResponse>> {
    return this.get<unknown>(`/invoices/by-project/${projectId}`, {
      status: query.status,
      skip: ((query.pageNumber ?? 1) - 1) * (query.pageSize ?? 20),
      take: query.pageSize ?? 20,
    }).pipe(map((r) => this.normalisePaged<InvoiceResponse>(r)));
  }

  /** `GET /invoices/by-project/{projectId}/outstanding` (InvoiceEndpoints.cs:76; sync W1-11). */
  getOutstanding(projectId: string): Observable<InvoiceResponse[]> {
    return this.get<unknown>(`/invoices/by-project/${projectId}/outstanding`).pipe(
      map((r) => this.unwrapArray<InvoiceResponse>(r)),
    );
  }

  private normalisePaged<T>(response: unknown): PagedResult<T> {
    const value = this.unwrap<Record<string, unknown>>(response);
    const items = this.unwrapArray<T>(this.field<unknown>(value, 'items') ?? value);
    return {
      items,
      totalCount: this.field<number>(value, 'totalCount') ?? items.length,
      page: this.field<number>(value, 'page', 'pageNumber') ?? 1,
      pageSize: this.field<number>(value, 'pageSize') ?? items.length,
      totalPages: this.field<number>(value, 'totalPages') ?? 1,
    };
  }
}

const INVOICE_TYPE_WIRE: Record<InvoiceType, number> = { ClientInvoice: 1, VendorInvoice: 2 };
function invoiceTypeWire(t: InvoiceType): number {
  return INVOICE_TYPE_WIRE[t];
}
