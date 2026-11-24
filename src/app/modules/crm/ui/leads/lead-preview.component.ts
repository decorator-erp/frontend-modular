import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, of, type Subscription } from 'rxjs';
import { CatalogService } from '@platform/i18n/catalog.service';
import { CanDirective, PERM } from '@platform/permissions';
import { ToastService } from '@platform/feedback/toast.service';
import {
  PeraAvatarComponent,
  PeraButtonComponent,
  PeraIconComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
} from '@ds';
import { CrmLeadService, type CrmLead } from '../../data/crm-lead.service';
import type { LeadIntakeResponse } from '../../model';
import { LeadStatus } from '../../model/crm-enums';
import { EXPERIENCE_KEYS, SECTOR_KEYS } from '../brief/brief-head.component';
import { LEAD_SOURCE_KEYS, LEAD_STATUS_KEYS, LEAD_STATUS_TONE } from './lead-labels';

/**
 * OS-6 (Ocean Studio): the desktop side panel for the selected lead. The list row carries no
 * intake, so the panel reads `GET /crm/leads/{id}/intake` for the selected lead only. "Mark
 * contacted" (a New lead only) is gated by `crm.leads.change_status`, like the detail page.
 */
@Component({
  selector: 'app-lead-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    RouterLink,
    PeraAvatarComponent,
    PeraButtonComponent,
    PeraIconComponent,
    PeraSkeletonComponent,
    PeraStatusBadgeComponent,
  ],
  host: { class: 'block' },
  template: `
    @let l = lead();
    <aside
      class="bg-surface border border-border-soft rounded-card shadow-[var(--shadow-card)] flex flex-col"
      [attr.aria-label]="catalog.t('leads.preview')"
      data-lead-preview
    >
      <div class="flex items-start gap-3 p-5 pb-4">
        <pera-avatar [name]="l.firstName + ' ' + l.lastName" size="lg" />
        <div class="flex-1 min-w-0">
          <h2 class="m-0 fs-h3 font-extrabold truncate">{{ l.firstName }} {{ l.lastName }}</h2>
          <div class="mt-1 flex items-center gap-2 flex-wrap">
            <pera-status-badge
              [tone]="statusTone[l.status]"
              [label]="catalog.t(statusKeys[l.status])"
            />
            <span class="fs-caption text-text-muted">{{ catalog.t(sourceKeys[l.source]) }}</span>
          </div>
        </div>
        <button
          type="button"
          class="size-[var(--space-8)] grid place-items-center rounded-[var(--radius-md)] text-text-muted hover:bg-surface-muted cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
          [attr.aria-label]="catalog.t('leads.closePreview')"
          (click)="closed.emit()"
          data-preview-close
        >
          <pera-icon name="x" [size]="16" />
        </button>
      </div>

      <dl class="m-0 px-5 pb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 fs-body-sm">
        <dt class="text-text-muted">{{ catalog.t('leads.fPhone') }}</dt>
        <dd class="m-0 font-semibold text-end" dir="ltr">{{ l.phone || '—' }}</dd>
        <dt class="text-text-muted">{{ catalog.t('leads.fEmail') }}</dt>
        <dd class="m-0 font-semibold text-end truncate" dir="ltr">{{ l.email || '—' }}</dd>
        <dt class="text-text-muted">{{ catalog.t('leads.colOwner') }}</dt>
        <dd class="m-0 font-semibold text-end truncate">{{ ownerName() }}</dd>
      </dl>

      <div class="mx-5 border-t border-border-soft"></div>
      <h3 class="m-0 px-5 pt-4 pb-2 fs-label font-bold uppercase tracking-[0.1em] text-text-muted">
        {{ catalog.t('intake.section') }}
      </h3>
      @if (loading()) {
        <div class="px-5 pb-4"><pera-skeleton [height]="72" rounded="md" /></div>
      } @else if (intake(); as i) {
        <dl
          class="m-0 px-5 pb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 fs-body-sm"
          data-intake
        >
          <dt class="text-text-muted">{{ catalog.t('intake.fSector') }}</dt>
          <dd class="m-0 text-end">
            @if (i.sector) {
              <span
                class="inline-flex px-2 py-0.5 rounded-full bg-sand-soft text-sand-ink fs-label font-bold"
                >{{ catalog.t(sectorKeys[i.sector]) }}</span
              >
            } @else {
              —
            }
          </dd>
          <dt class="text-text-muted">{{ catalog.t('leads.fArea') }}</dt>
          <dd class="m-0 font-semibold text-end tabular-nums">
            {{ i.areaSqm !== null && i.areaSqm !== undefined ? i.areaSqm + ' m²' : '—' }}
          </dd>
          <dt class="text-text-muted">{{ catalog.t('intake.fUnitAddress') }}</dt>
          <dd class="m-0 font-semibold text-end">{{ i.unitAddress || '—' }}</dd>
          <dt class="text-text-muted">{{ catalog.t('intake.designerSection') }}</dt>
          <dd class="m-0 font-semibold text-end">{{ designerHistory(i) }}</dd>
        </dl>
      } @else {
        <p class="m-0 px-5 pb-4 fs-body-sm text-text-muted" data-no-intake>
          {{ catalog.t('leads.noIntake') }}
        </p>
      }

      <div class="mt-auto p-5 pt-3 flex flex-wrap gap-2 border-t border-border-soft">
        <a
          [routerLink]="['/crm/leads', l.id]"
          data-preview-open
          class="flex-1 inline-flex items-center justify-center gap-2 px-4 h-[var(--space-10)] rounded-[var(--radius-control)] bg-accent text-text-on-accent fs-body-sm font-bold hover:bg-accent-hover outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >{{ catalog.t('leads.openLead') }}</a
        >
        @if (l.status === LeadStatus.New) {
          <pera-button
            *peraCan="PERM.crm.leads.changeStatus"
            variant="secondary"
            size="lg"
            [loading]="saving()"
            (click)="markContacted()"
            data-mark-contacted
            >{{ catalog.t('leads.markContacted') }}</pera-button
          >
        }
      </div>
    </aside>
  `,
})
export class LeadPreviewComponent {
  private readonly api = inject(CrmLeadService);
  private readonly toast = inject(ToastService);
  protected readonly catalog = inject(CatalogService);
  protected readonly PERM = PERM;
  protected readonly LeadStatus = LeadStatus;
  protected readonly statusKeys = LEAD_STATUS_KEYS;
  protected readonly statusTone = LEAD_STATUS_TONE;
  protected readonly sourceKeys = LEAD_SOURCE_KEYS;
  protected readonly sectorKeys = SECTOR_KEYS;

  readonly lead = input.required<CrmLead>();
  readonly ownerName = input<string>('—');
  readonly closed = output<void>();
  /** The lead's status changed here; the list refetches. */
  readonly changed = output<void>();

  readonly loading = signal(true);
  readonly saving = signal(false);
  /** `null` when the lead has no intake saved yet (or it could not be read). */
  readonly intake = signal<LeadIntakeResponse | null>(null);
  private sub?: Subscription;

  constructor() {
    effect(() => {
      const id = this.lead().id;
      this.sub?.unsubscribe();
      this.loading.set(true);
      this.sub = this.api
        .getIntake(id)
        .pipe(catchError(() => of(null)))
        .subscribe((i) => {
          this.intake.set(i && Object.keys(i).length ? i : null);
          this.loading.set(false);
        });
    });
  }

  protected designerHistory(i: LeadIntakeResponse): string {
    if (i.usedDesignerBefore == null) return '—';
    if (!i.usedDesignerBefore) return this.catalog.t('common.no');
    return i.designerExperience
      ? `${this.catalog.t('common.yes')} · ${this.catalog.t(EXPERIENCE_KEYS[i.designerExperience])}`
      : this.catalog.t('common.yes');
  }

  markContacted(): void {
    this.saving.set(true);
    this.api.updateStatus(this.lead().id, LeadStatus.Contacted).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.show({ tone: 'success', message: this.catalog.t('leads.statusChanged') });
        this.changed.emit();
      },
      error: () => {
        this.saving.set(false);
        this.toast.show({ tone: 'danger', message: this.catalog.t('leads.statusChangeFailed') });
      },
    });
  }
}
