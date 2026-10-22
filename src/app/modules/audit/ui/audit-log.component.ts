import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditService } from '../data/audit.service';
import { ToastService } from '@platform/feedback/toast.service';
import { AuditLogResponse, AuditQueryParams } from '../model/audit.model';
import { PeraEmptyComponent, PeraSkeletonComponent, PeraTooltipDirective } from '@ds';

const PAGE_SIZE = 30;

@Component({
  selector: 'app-audit-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, PeraEmptyComponent, PeraSkeletonComponent, PeraTooltipDirective],
  templateUrl: './audit-log.component.html',
})
export class AuditLogComponent implements OnInit {
  private readonly api = inject(AuditService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly entries = signal<AuditLogResponse[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = PAGE_SIZE;

  // Filters
  readonly action = signal('');
  readonly entityName = signal('');
  readonly userId = signal('');
  readonly from = signal('');
  readonly to = signal('');

  // Expanded row
  readonly expandedId = signal<string | null>(null);

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / PAGE_SIZE)));

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    const params: AuditQueryParams = {
      page: this.page(),
      pageSize: PAGE_SIZE,
      desc: true,
    };
    if (this.action()) params.action = this.action();
    if (this.entityName()) params.entityName = this.entityName();
    if (this.userId()) params.userId = this.userId();
    if (this.from()) params.from = this.from();
    if (this.to()) params.to = this.to();

    this.api.getLogs(params).subscribe({
      next: (result) => {
        this.entries.set(result.items);
        this.totalCount.set(result.totalCount);
        this.loading.set(false);
      },
      error: () => {
        this.entries.set([]);
        this.loading.set(false);
      },
    });
  }

  toggleExpand(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  exportCsv(): void {
    this.toast.show({ tone: 'info', message: 'CSV export coming soon' });
  }

  onFilterChange(): void {
    this.page.set(1);
    this.reload();
  }

  onPage(delta: number): void {
    const next = Math.max(1, Math.min(this.totalPages(), this.page() + delta));
    if (next !== this.page()) {
      this.page.set(next);
      this.reload();
    }
  }

  outcomeTone(outcome: string): 'success' | 'danger' | 'warning' | 'neutral' {
    const o = outcome.toLowerCase();
    if (o.includes('success')) return 'success';
    if (o.includes('fail') || o.includes('error')) return 'danger';
    if (o.includes('warn')) return 'warning';
    return 'neutral';
  }

  prettyJson(value: string | null): string {
    if (!value) return '—';
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
}
