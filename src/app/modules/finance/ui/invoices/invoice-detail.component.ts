import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InvoiceService } from '../../data/invoice.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { InvoiceResponse } from '../../model/invoice.model';
import { CanDirective, PERM } from '@platform/permissions';
import {
  ConfirmService,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraSkeletonComponent,
} from '@ds';

/**
 * Invoice detail — header strip, lines table, balance summary, cancel action.
 * Allocations / payments are recorded via the ledger allocate modal (not here).
 */
@Component({
  selector: 'app-invoice-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    RouterLink,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraSkeletonComponent,
  ],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    <div class="px-8 py-6 max-w-[var(--w-form)] mx-auto">
      @if (loading()) {
        <pera-skeleton [height]="220" rounded="md" />
      } @else if (invoice(); as inv) {
        <header class="mb-5">
          <div class="font-mono fs-label uppercase text-text-muted mb-1">
            <a
              [routerLink]="['/finance/projects', inv.projectId, 'invoices']"
              class="hover:text-text-primary no-underline"
              >INVOICES</a
            >
            <span class="mx-2">·</span><span>{{ inv.type }}</span> <span class="mx-2">·</span
            ><span>{{ inv.status }}</span>
          </div>
          <h1 class="m-0 fs-h2 font-semibold">{{ inv.number }}</h1>
          @if (inv.clientId) {
            <p class="m-0 mt-1 fs-caption text-text-secondary">Client {{ inv.clientId }}</p>
          }
          @if (inv.vendorName) {
            <p class="m-0 mt-1 fs-caption text-text-secondary">Vendor · {{ inv.vendorName }}</p>
          }
        </header>

        @if (alert(); as a) {
          <pera-alert tone="danger" class="block mb-4">{{ a }}</pera-alert>
        }

        <section
          class="grid grid-cols-2 md:grid-cols-4 border border-border bg-surface rounded-card mb-5"
        >
          <div class="p-4 border-r border-border">
            <div class="font-mono fs-label uppercase text-text-muted mb-1">Total</div>
            <div class="fs-h3 font-semibold tabular-nums">{{ inv.totalAmount }}</div>
          </div>
          <div class="p-4 border-r border-border">
            <div class="font-mono fs-label uppercase text-text-muted mb-1">Paid</div>
            <div class="fs-h3 font-semibold tabular-nums text-success">
              {{ inv.paidAmount }}
            </div>
          </div>
          <div class="p-4 border-r border-border">
            <div class="font-mono fs-label uppercase text-text-muted mb-1">Balance</div>
            <div class="fs-h3 font-semibold tabular-nums">{{ inv.balance }}</div>
          </div>
          <div class="p-4">
            <div class="font-mono fs-label uppercase text-text-muted mb-1">Issued / Due</div>
            <div class="fs-caption">
              {{ inv.issuedOn }}<span class="text-text-muted"> → </span>{{ inv.dueOn || '—' }}
            </div>
          </div>
        </section>

        <section class="border border-border bg-surface rounded-card mb-5">
          <header class="px-5 py-3 border-b border-border">
            <h3 class="m-0 fs-body-sm font-semibold">Lines</h3>
          </header>
          <table class="w-full border-collapse">
            <thead>
              <tr
                class="text-left font-mono fs-micro uppercase tracking-[0.04em] text-text-muted bg-bg"
              >
                <th class="p-2.5 font-medium">Description</th>
                <th class="p-2.5 font-medium w-[var(--w-column-sm)]">Unit</th>
                <th class="p-2.5 font-medium w-[var(--w-column-sm)] text-right">Qty</th>
                <th class="p-2.5 font-medium w-[var(--w-column)] text-right">Unit price</th>
                <th class="p-2.5 font-medium w-[var(--w-column)] text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              @for (l of inv.lines; track l.id) {
                <tr class="border-t border-border-soft fs-caption">
                  <td class="p-2.5">{{ l.description }}</td>
                  <td class="p-2.5 text-text-secondary">{{ l.unit || '—' }}</td>
                  <td class="p-2.5 text-right tabular-nums">{{ l.quantity }}</td>
                  <td class="p-2.5 text-right tabular-nums">{{ l.unitPrice }}</td>
                  <td class="p-2.5 text-right tabular-nums font-medium">{{ l.lineTotal }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="p-6 text-center text-text-muted fs-caption">No lines.</td>
                </tr>
              }
            </tbody>
          </table>
        </section>

        @if (inv.note) {
          <section class="border border-border bg-surface rounded-card p-5 mb-5">
            <div class="font-mono fs-label uppercase text-text-muted mb-2">Note</div>
            <p class="m-0 fs-caption text-text-secondary whitespace-pre-wrap">{{ inv.note }}</p>
          </section>
        }

        <section class="flex gap-2">
          <ng-container *peraCan="manageInvoice">
            <pera-button
              variant="danger"
              [disabled]="inv.status !== 'Open' || busy()"
              (click)="cancel(inv)"
              >Cancel invoice</pera-button
            >
          </ng-container>
        </section>
      }
    </div>
  `,
})
export class InvoiceDetailComponent implements OnInit {
  private readonly api = inject(InvoiceService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly manageInvoice = PERM.finance.manageInvoice;
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly alert = signal<string | null>(null);
  readonly invoice = signal<InvoiceResponse | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.load(id);
  }

  load(id: string): void {
    this.loading.set(true);
    this.api.getById(id).subscribe({
      next: (inv) => {
        this.invoice.set(inv);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  async cancel(inv: InvoiceResponse): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Cancel invoice',
      body: `Cancel invoice ${inv.number}? Payments already allocated stay on the ledger.`,
      confirmLabel: 'Cancel invoice',
      tone: 'danger',
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.cancel(inv.id).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: 'Invoice cancelled' });
        this.busy.set(false);
        this.load(inv.id);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.alert.set(friendly(this.errors.parse(err)));
      },
    });
  }
}
