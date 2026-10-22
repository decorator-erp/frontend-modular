import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '@platform/feedback/toast.service';
import { inject } from '@angular/core';
import { BoqItem, BoqDiscipline, BoqStatus } from './boq-item.types';
import { MOCK_BOQ_ITEMS } from './mock/boq-items.mock';

/**
 * Global BOQ catalog (C-05). Mock data only — backend wires in a later phase.
 */
@Component({
  selector: 'app-boq-catalog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DecimalPipe],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    <header class="px-7 pt-5 pb-3.5 border-b border-border bg-surface flex items-start gap-4">
      <div class="flex-1">
        <h1 class="m-0 fs-h2 font-semibold tracking-tight leading-tight">BOQ catalog</h1>
        <div class="font-mono fs-label text-text-muted mt-1.5 flex gap-2.5 items-center uppercase">
          <span>{{ filtered().length }} lines</span>
          <span class="text-border">·</span>
          <span>mock data · pending backend</span>
        </div>
      </div>
      <button
        type="button"
        class="font-mono fs-label text-text-secondary border border-border bg-surface hover:bg-surface-muted px-2.5 py-1 uppercase"
        (click)="toast.show({ tone: 'info', message: 'Export coming soon' })"
      >
        Export
      </button>
      <button
        type="button"
        class="fs-label bg-accent text-on-accent border border-accent px-3 py-1.5 hover:bg-accent-hover"
        (click)="toast.show({ tone: 'info', message: 'Add item — pending backend' })"
      >
        + Add item
      </button>
    </header>

    <div class="px-7 py-3 border-b border-border bg-surface flex items-center gap-2.5 flex-wrap">
      <select class="border border-border bg-bg px-2 py-1 fs-label" [(ngModel)]="discipline">
        <option [ngValue]="null">Discipline · All</option>
        @for (d of disciplines; track d) {
          <option [ngValue]="d">{{ d }}</option>
        }
      </select>
      <select class="border border-border bg-bg px-2 py-1 fs-label" [(ngModel)]="status">
        <option [ngValue]="null">Status · All</option>
        @for (s of statuses; track s) {
          <option [ngValue]="s">{{ s }}</option>
        }
      </select>
      <div class="inline-flex items-center gap-2 px-2.5 py-1.5 border border-border bg-bg">
        <input
          type="text"
          placeholder="Filter lines…"
          class="border-0 outline-0 bg-transparent fs-caption w-52"
          [ngModel]="search()"
          (ngModelChange)="search.set($event)"
        />
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full border-collapse">
        <thead>
          <tr>
            <th
              class="text-start font-mono fs-micro text-text-muted px-3 py-2.5 border-b border-border bg-surface uppercase"
            >
              #
            </th>
            <th
              class="text-start font-mono fs-micro text-text-muted px-3 py-2.5 border-b border-border bg-surface uppercase"
            >
              Code
            </th>
            <th
              class="text-start font-mono fs-micro text-text-muted px-3 py-2.5 border-b border-border bg-surface uppercase"
            >
              Item
            </th>
            <th
              class="text-start font-mono fs-micro text-text-muted px-3 py-2.5 border-b border-border bg-surface uppercase"
            >
              Discipline
            </th>
            <th
              class="text-start font-mono fs-micro text-text-muted px-3 py-2.5 border-b border-border bg-surface uppercase"
            >
              Spec
            </th>
            <th
              class="text-end font-mono fs-micro text-text-muted px-3 py-2.5 border-b border-border bg-surface uppercase"
            >
              Qty
            </th>
            <th
              class="text-start font-mono fs-micro text-text-muted px-3 py-2.5 border-b border-border bg-surface uppercase"
            >
              Unit
            </th>
            <th
              class="text-end font-mono fs-micro text-text-muted px-3 py-2.5 border-b border-border bg-surface uppercase"
            >
              Rate
            </th>
            <th
              class="text-end font-mono fs-micro text-text-muted px-3 py-2.5 border-b border-border bg-surface uppercase"
            >
              Total
            </th>
            <th
              class="text-start font-mono fs-micro text-text-muted px-3 py-2.5 border-b border-border bg-surface uppercase"
            >
              Vendor
            </th>
            <th
              class="text-start font-mono fs-micro text-text-muted px-3 py-2.5 border-b border-border bg-surface uppercase"
            >
              Status
            </th>
            <th
              class="text-start font-mono fs-micro text-text-muted px-3 py-2.5 border-b border-border bg-surface uppercase"
            >
              Updated
            </th>
          </tr>
        </thead>
        <tbody>
          @for (row of filtered(); track row.id; let i = $index) {
            <tr class="hover:bg-surface-muted transition-colors">
              <td class="px-3 py-2 border-b border-border-soft font-mono fs-label text-text-muted">
                {{ i + 1 }}
              </td>
              <td
                class="px-3 py-2 border-b border-border-soft font-mono fs-label text-text-secondary"
              >
                {{ row.code }}
              </td>
              <td class="px-3 py-2 border-b border-border-soft fs-caption font-medium">
                {{ row.itemName }}
                @if (row.itemNameAr) {
                  <span dir="rtl" class="block fs-label text-text-muted mt-0.5">{{
                    row.itemNameAr
                  }}</span>
                }
              </td>
              <td class="px-3 py-2 border-b border-border-soft">
                <span
                  class="font-mono fs-micro border border-border bg-bg px-1.5 py-0.5 uppercase"
                  >{{ row.discipline }}</span
                >
              </td>
              <td
                class="px-3 py-2 border-b border-border-soft fs-label text-text-secondary max-w-[var(--w-panel)] truncate"
              >
                {{ row.spec }}
              </td>
              <td class="px-3 py-2 border-b border-border-soft text-end font-sans tabular-nums">
                {{ row.quantity }}
              </td>
              <td class="px-3 py-2 border-b border-border-soft fs-label">{{ row.unit }}</td>
              <td class="px-3 py-2 border-b border-border-soft text-end font-sans tabular-nums">
                {{ row.unitRate | number }}
              </td>
              <td
                class="px-3 py-2 border-b border-border-soft text-end font-sans tabular-nums font-medium"
              >
                {{ row.total | number }}
              </td>
              <td class="px-3 py-2 border-b border-border-soft fs-label text-text-secondary">
                {{ row.vendorName || '—' }}
              </td>
              <td class="px-3 py-2 border-b border-border-soft">
                <span
                  class="font-mono fs-micro border bg-bg px-1.5 py-0.5 uppercase"
                  [class]="statusClass(row.status)"
                  >{{ row.status }}</span
                >
              </td>
              <td class="px-3 py-2 border-b border-border-soft font-mono fs-label text-text-muted">
                {{ row.updatedAt }}
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="12" class="text-center py-10 text-text-muted fs-caption">
                No items match these filters.
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <div
      class="px-6 py-3 border-t border-border bg-surface flex justify-between font-mono fs-label text-text-muted"
    >
      <span>Subtotal · EGP {{ total() | number }}</span>
      <span>{{ filtered().length }} of {{ items().length }} lines</span>
    </div>
  `,
})
export class BoqCatalogComponent {
  readonly toast = inject(ToastService);
  readonly items = signal<BoqItem[]>(MOCK_BOQ_ITEMS);
  readonly discipline = signal<BoqDiscipline | null>(null);
  readonly status = signal<BoqStatus | null>(null);
  readonly search = signal('');

  readonly disciplines: BoqDiscipline[] = [
    'Joinery',
    'Stone',
    'Tile',
    'Lighting',
    'MEP',
    'Finishing',
  ];
  readonly statuses: BoqStatus[] = [
    'Draft',
    'Pending quote',
    'Quoted',
    'Approved',
    'Issued',
    'Delivered',
  ];

  readonly filtered = computed(() => {
    const d = this.discipline();
    const s = this.status();
    const term = this.search().trim().toLowerCase();
    return this.items().filter((i) => {
      if (d && i.discipline !== d) return false;
      if (s && i.status !== s) return false;
      if (term && !`${i.code} ${i.itemName}`.toLowerCase().includes(term)) return false;
      return true;
    });
  });

  readonly total = computed(() => this.filtered().reduce((sum, i) => sum + i.total, 0));

  statusClass(s: BoqStatus): string {
    switch (s) {
      case 'Approved':
      case 'Issued':
      case 'Delivered':
        return 'text-success border-success bg-success-soft';
      case 'Pending quote':
      case 'Draft':
        return 'text-text-muted border-border';
      case 'Quoted':
        return 'text-info border-info bg-info-soft';
      default:
        return 'text-text-muted border-border';
    }
  }
}
