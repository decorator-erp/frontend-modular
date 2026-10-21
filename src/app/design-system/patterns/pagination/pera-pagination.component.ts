import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PeraButtonComponent } from '../../components/button/pera-button.component';

@Component({
  selector: 'pera-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraButtonComponent],
  host: { class: 'block' },
  template: `
    <div class="flex items-center justify-between gap-3 flex-wrap fs-body-sm text-text-secondary">
      <span>Showing {{ from() }}–{{ to() }} of {{ totalCount() }}</span>
      <div class="flex items-center gap-2">
        <pera-button
          size="xs"
          variant="tertiary"
          [disabled]="page() <= 1"
          (click)="pageChange.emit(page() - 1)"
        >
          Prev
        </pera-button>
        <span class="tabular-nums">Page {{ page() }} of {{ totalPages() }}</span>
        <pera-button
          size="xs"
          variant="tertiary"
          [disabled]="page() >= totalPages()"
          (click)="pageChange.emit(page() + 1)"
        >
          Next
        </pera-button>
      </div>
    </div>
  `,
})
export class PeraPaginationComponent {
  readonly page = input(1);
  readonly pageSize = input(20);
  readonly totalCount = input(0);
  readonly pageChange = output<number>();

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalCount() / Math.max(1, this.pageSize()))),
  );
  readonly from = computed(() =>
    this.totalCount() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1,
  );
  readonly to = computed(() => Math.min(this.page() * this.pageSize(), this.totalCount()));
}
