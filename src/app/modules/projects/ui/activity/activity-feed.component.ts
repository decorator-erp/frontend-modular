import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { catchError, of } from 'rxjs';
import { ActivityService } from '@modules/audit';
import { ActivityResponse } from '@modules/audit';
import {
  PeraAvatarComponent,
  PeraEmptyComponent,
  PeraSkeletonComponent,
  PeraIconComponent,
} from '@ds';

/** A feed row — one activity plus the count of identical events it stands in for. */
interface FeedRow {
  a: ActivityResponse;
  count: number;
}

/** Same actor + action + entity → part of one collapsible run (compact mode). */
function sameRun(x: ActivityResponse, y: ActivityResponse): boolean {
  return (
    x.action === y.action &&
    (x.actorUserId ?? x.actorName) === (y.actorUserId ?? y.actorName) &&
    (x.entityId ?? x.entityName) === (y.entityId ?? y.entityName)
  );
}

/**
 * Reusable activity feed. Powers:
 *   - Project Detail · Overview "Recent activity" panel (`projectId`, compact, take 8)
 *   - Stage Detail · Activity tab (`entityName="ProjectStage"`, take 100)
 *   - Task Detail · Activities tab (`entityName="ProjectTask"`, take 100)
 * Sync W1-5: entity names are the ones the backend writes — "Project", "ProjectStage", "ProjectTask".
 *
 * Three loading modes selected via inputs:
 *   - `entityName + entityId`  → per-entity timeline
 *   - `projectId`              → per-project feed
 *   - (nothing)                → global feed
 *
 * `compact` mode hides the date header rail and limits to the first `take`.
 */
@Component({
  selector: 'app-activity-feed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraAvatarComponent, PeraEmptyComponent, PeraSkeletonComponent, PeraIconComponent],
  template: `
    @if (loading()) {
      <div class="flex flex-col gap-2 p-4">
        <pera-skeleton [height]="36" />
        <pera-skeleton [height]="36" />
        <pera-skeleton [height]="36" />
      </div>
    } @else if (items().length === 0) {
      <pera-empty
        title="No activity yet"
        description="Edits, status changes and approvals will show up here."
      />
    } @else {
      <ul class="flex flex-col">
        @for (row of rows(); track row.a.id) {
          @let a = row.a;
          <li
            class="grid grid-cols-[var(--icon-lg)_1fr_auto] gap-3 items-start px-5 py-3 border-b border-border-soft last:border-b-0 hover:bg-surface-muted transition-colors"
          >
            <pera-avatar [name]="a.actorName ?? 'System'" size="sm" />
            <div class="min-w-0">
              <div class="fs-caption leading-snug">
                <span class="font-medium">{{ a.actorName ?? 'System' }}</span>
                <!-- Sync W1-5: the backend's own sentence is the headline when there is one. -->
                @if (showMessage(a)) {
                  <span class="text-text-primary" data-message> {{ a.message }} </span>
                } @else {
                  <span class="text-text-secondary"> {{ verb(a.action, a.entityName) }} </span>
                  @if (a.entityDisplayName) {
                    <span class="font-medium">{{ a.entityDisplayName }}</span>
                  } @else {
                    <span class="font-mono fs-label text-text-muted">{{ a.entityName }}</span>
                  }
                }
                @if (row.count > 1) {
                  <span class="font-mono fs-label text-text-muted">× {{ row.count }}</span>
                }
              </div>
              <div
                class="flex items-center gap-2 font-mono fs-micro uppercase tracking-[0.04em] text-text-muted mt-1"
              >
                <pera-icon [name]="iconFor(a.action)" [size]="11" />
                <span>{{ actionLabel(a.action) }}</span>
                <span>·</span>
                <span>{{ a.entityDisplayName || a.entityName }}</span>
              </div>
            </div>
            <span class="font-mono fs-label text-text-muted tabular-nums whitespace-nowrap mt-0.5">
              {{ relative(a.occurredAt) }}
            </span>
          </li>
        }
      </ul>
      @if (compact() && totalCount() > items().length) {
        <!-- mt-auto: when the feed host is a flex column that fills its card (the
             Project dashboard Activity panel), this footer drops to the bottom. -->
        <div class="px-5 py-2.5 border-t border-border-soft text-end mt-auto">
          <span class="font-mono fs-label text-text-muted">
            {{ items().length }} of {{ totalCount() }} shown
          </span>
        </div>
      }
    }
  `,
})
export class ActivityFeedComponent {
  private readonly api = inject(ActivityService);

  /** Per-entity feed (Project | Stage | Task | ...). */
  readonly entityName = input<string | null>(null);
  readonly entityId = input<string | null>(null);
  /** Per-project feed (used when entity is not specified). */
  readonly projectId = input<string | null>(null);
  /** Max items to fetch. */
  readonly take = input(50);
  /** Compact mode used on Overview tab — small list, no scroll, "X of N shown" hint. */
  readonly compact = input(false);
  /** Emits the shown-item count once a fetch resolves (host panels use it for a header chip). */
  readonly loaded = output<number>();

  readonly loading = signal(true);
  readonly items = signal<ActivityResponse[]>([]);
  readonly totalCount = signal(0);

  /**
   * Display rows. In compact mode, consecutive runs of the same action by the
   * same actor on the same entity collapse into one row with a `× N` count, so a
   * burst of low-value `*Viewed` audit rows doesn't crowd out substantive events.
   * The full Activity tab (non-compact) renders every row as-is.
   *
   * TODO(route): activity feed needs an exclude-views / significant-only filter
   * so this can be done server-side instead of collapsing client-side.
   */
  readonly rows = computed<FeedRow[]>(() => {
    const list = this.items();
    if (!this.compact()) return list.map((a) => ({ a, count: 1 }));
    const out: FeedRow[] = [];
    for (const a of list) {
      const prev = out[out.length - 1];
      if (prev && sameRun(prev.a, a)) prev.count++;
      else out.push({ a, count: 1 });
    }
    return out;
  });

  /** When mode params change, refetch. */
  private readonly reload = effect(() => {
    const ent = this.entityName();
    const eid = this.entityId();
    const pid = this.projectId();
    const take = this.take();
    this.loading.set(true);
    const obs =
      ent && eid
        ? this.api.getEntityTimeline(ent, eid, { pageSize: take })
        : pid
          ? this.api.getProjectFeed(pid, { pageSize: take })
          : this.api.getFeed({ pageSize: take });
    obs
      .pipe(catchError(() => of({ items: [], totalCount: 0, page: 1, pageSize: 0, totalPages: 0 })))
      .subscribe((res) => {
        this.items.set(res.items);
        this.totalCount.set(res.totalCount);
        this.loading.set(false);
        this.loaded.emit(res.items.length);
      });
  });

  /**
   * Human verb for the sentence. Known bare verbs map directly; compound audit
   * actions ("ProjectViewed", "TaskCompleted") are split on CamelCase, the
   * leading entity word is dropped, and the rest lowercased → "viewed".
   */
  verb(action: string, entityName?: string | null): string {
    if (VERB[action]) return VERB[action];
    const words = this.splitWords(action);
    if (words.length > 1 && entityName && words[0].toLowerCase() === entityName.toLowerCase()) {
      words.shift();
    }
    return words.join(' ').toLowerCase();
  }

  /** Title-cased, spaced action for the meta chip ("ProjectViewed" → "Project viewed"). */
  actionLabel(action: string): string {
    const words = this.splitWords(action);
    if (!words.length) return action;
    return [words[0], ...words.slice(1).map((w) => w.toLowerCase())].join(' ');
  }

  /** Split a CamelCase / PascalCase action token into its words. */
  private splitWords(action: string): string[] {
    // Sync W1-5: the service maps the AuditAction int; String() keeps a stray number from crashing.
    return String(action ?? '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[\s_]+/)
      .filter(Boolean);
  }

  /**
   * Whether the `message` line carries detail beyond the action itself. Audit
   * messages are often just a humanized restatement of the action ("Project
   * Viewed" for `ProjectViewed`) — suppress those echoes, keep real detail.
   */
  showMessage(a: ActivityResponse): boolean {
    const msg = a.message?.trim();
    if (!msg) return false;
    const norm = (s: string): string => s.toLowerCase().replace(/[\s_]+/g, '');
    const m = norm(msg);
    return m !== norm(a.action) && m !== norm(this.actionLabel(a.action));
  }

  iconFor(action: string): 'edit' | 'check-circle' | 'plus' | 'trash' | 'lock' | 'flag' {
    if (/^create$|created|added/i.test(action)) return 'plus';
    if (/^delete$|deleted|removed/i.test(action)) return 'trash';
    if (/completed|approved|satisfied/i.test(action)) return 'check-circle';
    if (/locked/i.test(action)) return 'lock';
    if (/started|activated/i.test(action)) return 'flag';
    return 'edit';
  }

  /** Cheap "5m ago / 2h ago / 3d ago / Jan 5" relative timestamp. */
  relative(iso: string): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    const diff = Date.now() - then;
    const m = Math.floor(diff / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // computed used in compact footer
  readonly hasMore = computed(() => this.totalCount() > this.items().length);
}

const VERB: Record<string, string> = {
  Create: 'created',
  Created: 'created',
  Update: 'updated',
  Updated: 'updated',
  Delete: 'deleted',
  Deleted: 'deleted',
  Complete: 'completed',
  Completed: 'completed',
  Start: 'started',
  Started: 'started',
  Approve: 'approved',
  Approved: 'approved',
  Reject: 'rejected',
  Rejected: 'rejected',
  Satisfy: 'satisfied',
  Satisfied: 'satisfied',
  Assign: 'assigned',
  Assigned: 'assigned',
  Activate: 'activated',
  Activated: 'activated',
  Lock: 'locked',
  Locked: 'locked',
};
