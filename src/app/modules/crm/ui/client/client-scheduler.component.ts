import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import { MeetingType } from '../../model/crm-enums';
import type { FreeSlot } from '../../model';
import { PeraAlertComponent, PeraButtonComponent, PeraCardComponent } from '@ds';
import { MEETING_TYPE_KEYS } from '../scheduler/meeting-labels';
import { CrmSlotGridComponent } from '../scheduler/slot-grid.component';
import { isSlotHoldExpired, MeetingsStore } from '../../stores/meetings.store';

const TYPES = [MeetingType.InOffice, MeetingType.OnSite, MeetingType.Online] as const;

/**
 * The client scheduler (T052, FR-023) — **mobile-first**: grid → tap → type picker →
 * request sheet → Held (009b #19: no hold timestamp on the slot, so no expiry line). No step opens a second overlay system; each is
 * a stacked section on the SAME page, which is what keeps this usable at phone width
 * with no horizontal scrolling (US2 scenario 4) — the same reasoning that shaped
 * `CrmSlotGridComponent` itself (day pills + a vertical list, not a literal grid table).
 *
 * `host = input.required<{ projectId, periodId }>()`-shaped inputs so B6a's client
 * shell can host this directly once it lands; this component holds no shell-specific
 * assumptions of its own (FR-038 — the client shell is structural, not this screen's job).
 */
@Component({
  selector: 'app-crm-client-scheduler',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MeetingsStore],
  imports: [PeraAlertComponent, PeraButtonComponent, PeraCardComponent, CrmSlotGridComponent],
  host: { class: 'block max-w-full' },
  template: `
    <div class="flex flex-col gap-4">
      @if (heldSlot()) {
        <pera-card>
          <div class="flex flex-col gap-2 p-1">
            <div class="font-semibold text-text-primary">{{ catalog.t('sched.csHeldT') }}</div>
            <p class="fs-body-sm text-text-secondary m-0">{{ catalog.t('sched.csHeldB') }}</p>
            <pera-button variant="secondary" size="sm" (click)="reset()">{{
              catalog.t('common.dismiss')
            }}</pera-button>
          </div>
        </pera-card>
      } @else if (step() === 'confirm' && picked(); as slot) {
        <pera-card>
          <div class="flex flex-col gap-3 p-1">
            <div class="font-semibold text-text-primary">{{ catalog.t('sched.csSend') }}</div>
            <div class="fs-body-sm text-text-secondary" dir="ltr">
              {{ whenLabel(slot.startsAtUtc) }}
            </div>

            <div class="flex flex-col gap-2">
              <span class="fs-caption text-text-secondary">{{ catalog.t('sched.csType') }}</span>
              <div class="flex gap-2 flex-wrap">
                @for (t of types; track t) {
                  <button
                    type="button"
                    class="px-3 py-1.5 fs-body-sm border cursor-pointer transition-colors
                           outline-none focus-visible:outline-2 focus-visible:outline-accent"
                    [class.bg-accent]="type() === t"
                    [class.text-on-accent]="type() === t"
                    [class.border-accent]="type() === t"
                    [class.bg-surface]="type() !== t"
                    [class.border-border]="type() !== t"
                    (click)="type.set(t)"
                  >
                    {{ catalog.t(typeKey(t)) }}
                  </button>
                }
              </div>
            </div>

            @if (error()) {
              <pera-alert tone="danger">{{ error() }}</pera-alert>
            }

            <div class="flex items-center gap-2">
              <pera-button variant="secondary" (click)="step.set('grid')">{{
                catalog.t('common.dismiss')
              }}</pera-button>
              <pera-button variant="primary" [loading]="requesting()" (click)="requestSlot()">{{
                catalog.t('sched.csSend')
              }}</pera-button>
            </div>
          </div>
        </pera-card>
      } @else {
        @if (lapsedNotice()) {
          <pera-alert tone="warning">
            <div class="flex items-center gap-3">
              <span class="flex-1">{{ lapsedNotice() }}</span>
              <pera-button variant="ghost" size="xs" (click)="dismissLapsed()">{{
                catalog.t('common.dismiss')
              }}</pera-button>
            </div>
          </pera-alert>
        }
        <div>
          <p class="fs-caption text-text-secondary mb-2">{{ catalog.t('sched.csTapHint') }}</p>
          <app-crm-slot-grid
            [freeSlots]="meetings.freeSlots()"
            [meetings]="meetings.meetings()"
            [interactive]="true"
            (slotTap)="onSlotTap($event)"
          />
        </div>
      }
    </div>
  `,
})
export class CrmClientSchedulerComponent {
  protected readonly catalog = inject(CatalogService);
  protected readonly meetings = inject(MeetingsStore);
  protected readonly types = TYPES;

  readonly projectId = input.required<string>();
  readonly periodId = input<string | null>(null);

  protected readonly step = signal<'grid' | 'confirm'>('grid');
  protected readonly picked = signal<FreeSlot | null>(null);
  protected readonly type = signal<MeetingType>(MeetingType.InOffice);
  protected readonly requesting = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly confirmedSlot = signal<FreeSlot | null>(null);
  protected readonly lapsedNotice = signal<string | null>(null);

  /** A LIVE clock — a hold lapsing while the client watches must flip the banner on its
   *  own (US2 scenario 5 / T054), not wait for a prop to change. */
  private readonly now = signal(Date.now());

  /** Once the request succeeds, find that exact slot in the reloaded list — Held (T052). */
  protected readonly heldSlot = computed(() => {
    const confirmed = this.confirmedSlot();
    if (!confirmed) return null;
    return (
      this.meetings
        .meetings()
        .flatMap((m) => m.slots)
        .find((s) => s.startsAtUtc === confirmed.startsAtUtc && s.proposedByMe) ?? null
    );
  });

  private readonly pendingRequest = signal<FreeSlot | null>(null);

  constructor() {
    const ticker = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(ticker));

    let loaded = false;
    effect(() => {
      const projectId = this.projectId();
      if (loaded || !projectId) return;
      loaded = true;
      const fromUtc = new Date().toISOString();
      const toUtc = new Date(Date.now() + 30 * 86_400_000).toISOString();
      this.meetings.loadFreeSlots(projectId, fromUtc, toUtc);
      this.meetings.loadPortal(projectId);
    });

    // Mirrors CrmPeriodCardComponent's `wasClosing` pattern: react to `mutating` falling
    // edge rather than threading a completion callback through the store's patchState.
    let wasMutating = false;
    effect(() => {
      const mutating = this.meetings.mutating();
      const requested = this.pendingRequest();
      if (wasMutating && !mutating && requested) {
        this.requesting.set(false);
        this.pendingRequest.set(null);
        if (this.meetings.error()) {
          // The store's own text is English-only prose (office/client shared store,
          // FR-037b) — a client-facing screen must show a catalog string instead.
          this.error.set(this.catalog.t('sched.csRequestFailed'));
        } else {
          this.confirmedSlot.set(requested);
        }
      }
      wasMutating = mutating;
    });

    // T054 — a hold lapsing while the client watches the confirmation banner: tell them
    // and return to the grid, rather than silently flipping the slot back to free.
    effect(() => {
      const held = this.heldSlot();
      const nowMs = this.now();
      if (held && isSlotHoldExpired(held, nowMs)) {
        this.confirmedSlot.set(null);
        this.lapsedNotice.set(this.catalog.t('sched.holdLapsed'));
      }
    });
  }

  protected dismissLapsed(): void {
    this.lapsedNotice.set(null);
  }

  protected typeKey(t: MeetingType): CatalogKey {
    return MEETING_TYPE_KEYS[t];
  }

  protected whenLabel(iso: string): string {
    return formatCairoDateTime(iso, this.catalog.locale());
  }

  protected onSlotTap(slot: FreeSlot): void {
    this.picked.set(slot);
    this.step.set('confirm');
  }

  protected reset(): void {
    this.confirmedSlot.set(null);
    this.picked.set(null);
    this.step.set('grid');
  }

  protected requestSlot(): void {
    const slot = this.picked();
    if (!slot) return;
    this.requesting.set(true);
    this.error.set(null);
    this.pendingRequest.set(slot);
    this.meetings.portalRequestSlot({
      projectId: this.projectId(),
      periodId: this.periodId(),
      title: this.catalog.t(this.typeKey(this.type())),
      type: this.type(),
      startsAtUtc: slot.startsAtUtc,
      endsAtUtc: slot.endsAtUtc,
    });
  }
}
