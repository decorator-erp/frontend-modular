/**
 * Task/stage invoice-line drilldown — a denormalised projection that joins
 * invoice header fields onto each line (distinct from `InvoiceLineResponse`,
 * the write model). Money and quantity fields are decimal STRINGS.
 *
 * `invoiceType` / `invoiceStatus` mirror the canonical `InvoiceType` /
 * `InvoiceStatus` enums (`@shared/enums/finance`); inlined because `core` may
 * not import `shared` under the architecture boundary rule.
 */
export interface TaskInvoiceLineResponse {
  invoiceId: string;
  invoiceNumber: string;
  invoiceType: 'ClientInvoice' | 'VendorInvoice';
  invoiceStatus: 'Open' | 'Paid' | 'Cancelled';
  /** ISO date. */
  issuedOn: string;
  invoiceLineId: string;
  description: string;
  /** decimal(19,4) — string. */
  quantity: string;
  unit: string | null;
  /** decimal(19,4) — string. */
  unitPrice: string;
  /** decimal(19,4) — string. */
  lineTotal: string;
  budgetLineId: string | null;
}
