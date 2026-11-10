import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface DependencyNode {
  id: string;
  label: string;
}

export interface DependencyEdge {
  /** id of the prerequisite */
  from: string;
  /** id of the dependent */
  to: string;
}

/**
 * Compact dependency view — lists each edge as `prerequisite → dependent` with
 * mono labels. A lightweight stand-in for a full graph; square, token-driven.
 */
@Component({
  selector: 'pera-dependency-graph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ul class="m-0 p-0 list-none border border-border bg-surface rounded-card">
      @for (edge of edges(); track $index) {
        <li
          class="flex items-center gap-2 px-4 py-2 border-b border-border-soft last:border-b-0 font-mono fs-label"
        >
          <span class="text-text-secondary truncate">{{ label(edge.from) }}</span>
          <span class="text-text-muted shrink-0" aria-label="unlocks">→</span>
          <span class="text-text-primary truncate">{{ label(edge.to) }}</span>
        </li>
      } @empty {
        <li class="px-4 py-3 fs-caption text-text-muted">No dependencies.</li>
      }
    </ul>
  `,
})
export class PeraDependencyGraphComponent {
  readonly nodes = input<DependencyNode[]>([]);
  readonly edges = input<DependencyEdge[]>([]);

  private readonly labelMap = computed(() => {
    const map = new Map<string, string>();
    for (const n of this.nodes()) map.set(n.id, n.label);
    return map;
  });

  protected label(id: string): string {
    return this.labelMap().get(id) ?? id;
  }
}
