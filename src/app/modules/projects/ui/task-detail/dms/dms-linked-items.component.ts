import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { input } from '@angular/core';
import { DependencyTreeService } from '@modules/finance';
import type { TaskTreeNode } from '@modules/finance';
import { DmsStatusPillComponent } from './dms-status-pill.component';

/**
 * Linked-items panel BODY for the DMS Task Detail design (CSS 161-167, markup
 * 529-535). Flat `.lk-row` list of the task's dependency-graph neighbours.
 *
 * The Financial dependency-tree API (`DependencyTreeService.forTask`) returns a
 * rooted `TaskTreeNode` whose direct `children` are the neighbours in one
 * traversal `direction`. We fetch BOTH directions and merge the roots' direct
 * children into two relation buckets:
 *   • Upstream   → tasks this one depends on → "Blocked by"
 *   • Downstream → tasks that depend on this → "Blocks"
 * There is no "Relates to" edge nor any task code/order field in this model, so
 * the design's third relation and the `.lcode` cell are omitted gracefully
 * (no invented data). Status presentation is delegated to `app-dms-status-pill`.
 */
interface LinkedRow {
  readonly id: string;
  readonly relation: 'Blocked by' | 'Blocks';
  readonly name: string;
  readonly status: string;
}

@Component({
  selector: 'app-dms-linked-items',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DmsStatusPillComponent],
  template: `
    @if (loading()) {
      <div class="px-4 py-2.5 fs-caption text-text-muted">Loading…</div>
    } @else if (rows().length === 0) {
      <div class="px-4 py-2.5 fs-caption text-text-muted">No linked items.</div>
    } @else {
      @for (row of rows(); track row.id) {
        <div
          class="flex items-center gap-3 px-4 py-2.5 border-b border-border-soft last:border-b-0 hover:bg-surface-muted"
        >
          <span
            class="fs-micro uppercase font-semibold tracking-[0.04em] text-text-muted w-[var(--w-column-sm)] flex-shrink-0"
          >
            {{ row.relation }}
          </span>
          <span class="flex-1 fs-caption font-medium truncate min-w-0">{{ row.name }}</span>
          <app-dms-status-pill [status]="row.status" />
        </div>
      }
    }
  `,
})
export class DmsLinkedItemsComponent {
  readonly taskId = input.required<string>();

  private readonly deps = inject(DependencyTreeService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(false);
  protected readonly rows = signal<readonly LinkedRow[]>([]);

  constructor() {
    effect(() => {
      const id = this.taskId();
      untracked(() => this.load(id));
    });
  }

  private load(id: string): void {
    if (!id) {
      this.rows.set([]);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    forkJoin({
      blockedBy: this.deps.forTask(id, { direction: 'Upstream', maxDepth: 1 }),
      blocks: this.deps.forTask(id, { direction: 'Downstream', maxDepth: 1 }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ blockedBy, blocks }) => {
          this.rows.set([
            ...this.toRows(blockedBy.root.children, 'Blocked by'),
            ...this.toRows(blocks.root.children, 'Blocks'),
          ]);
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.loading.set(false);
        },
      });
  }

  private toRows(nodes: readonly TaskTreeNode[], relation: LinkedRow['relation']): LinkedRow[] {
    return nodes.map((n) => ({
      id: n.projectTaskId,
      relation,
      name: n.name,
      status: n.status,
    }));
  }
}
