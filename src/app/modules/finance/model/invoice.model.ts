import type { InvoiceStatus, InvoiceType } from './enums';
import type { InvoiceLineRequest, InvoiceLineResponse } from './invoice-line.model';

/**
 * Invoice — per `api-docs/11-finance.md` Section 4.
 *
 * Payment is recorded by ALLOCATING a ledger entry (`/ledger-entries/{id}/allocate`),
 * not by a dedicated pay endpoint. `paidAmount` is server-cached from those
 * allocations.
 */
export interface InvoiceResponse {
  id: string;
  projectId: string;
  projectStageId: string | null;
  type: InvoiceType;
  clientId: string | null;
  vendorName: string | null;
  number: string;
  /** ISO date. */
  issuedOn: string;
  /** ISO date. */
  dueOn: string | null;
  /** decimal(19,4) — string. Server-cached from lines. */
  totalAmount: string;
  /** decimal(19,4) — string. Server-cached from allocations. */
  paidAmount: string;
  /** decimal(19,4) — string. = total − paid. */
  balance: string;
  status: InvoiceStatus;
  note: string | null;
  lines: InvoiceLineResponse[];
}

export interface CreateInvoiceRequest {
  projectId: string;
  type: InvoiceType;
  number: string;
  /** ISO date. */
  issuedOn: string;
  /** ISO date. */
  dueOn?: string | null;
  projectStageId?: string | null;
  /** Required when `type === 'ClientInvoice'`. */
  clientId?: string | null;
  /** Required when `type === 'VendorInvoice'`. */
  vendorName?: string | null;
  note?: string | null;
  /** At least one line. */
  lines: InvoiceLineRequest[];
}

export type { InvoiceLineRequest, InvoiceLineResponse };
