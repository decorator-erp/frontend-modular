import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogService } from '@platform/i18n/catalog.service';
import { CanDirective, PERM } from '@platform/permissions';
import { ToastService } from '@platform/feedback/toast.service';
import { ApprovalState } from '../../model/crm-enums';
import type { CrmSpace } from '../../model';
import {
  ModalService,
  PeraButtonComponent,
  PeraStatusBadgeComponent,
  PeraTextareaComponent,
} from '@ds';
import { trustChip } from '../trust/trust-chip';
import { CrmSupersedeEntryModalComponent } from '../brief/supersede-entry.modal';
import { SpacesStore } from '../../stores/spaces.store';
import { domainErrorKey } from '../domain-error-key';

/**
 * The space's brief free text, above the board. It binds `requirements` on the space's
 * current brief entry and saves through the existing brief commands — a Draft/Rejected
 * entry edits in place; an Approved entry is locked and the button becomes "Create
 * correction", routing through the supersede modal; no entry yet → Save creates one
 * preset to this space.
 */
@Component({
  selector: 'app-crm-space-brief-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    CanDirective,
    PeraButtonComponent,
    PeraStatusBadgeComponent,
    PeraTextareaComponent,
  ],
  template: `
    <section class="bg-surface border border-border rounded-card">
      <header class="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span class="fs-label uppercase tracking-wide text-text-muted">{{
          catalog.t('space.noteTitle')
        }}</span>
        @if (entry(); as e) {
          <pera-status-badge
            [tone]="chip(e).tone"
            [label]="catalog.t(chip(e).key)"
            class="ms-auto"
          />
        }
      </header>
      <div class="p-4 flex flex-col gap-3">
        @if (editing()) {
          <pera-textarea
            [ngModel]="text()"
            (ngModelChange)="text.set($event)"
            [rows]="3"
            [placeholder]="catalog.t('space.notePlaceholder')"
          />
          <div class="flex items-center gap-2">
            <pera-button
              variant="primary"
              size="sm"
              [loading]="store.savingSpace()"
              (click)="save()"
              >{{ catalog.t('space.save') }}</pera-button
            >
            <pera-button variant="ghost" size="sm" (click)="editing.set(false)">{{
              catalog.t('space.cancel')
            }}</pera-button>
          </div>
        } @else {
          @if (entry()?.requirements) {
            <p class="fs-body text-text m-0 whitespace-pre-wrap" dir="auto">
              {{ entry()!.requirements }}
            </p>
          } @else {
            <p class="fs-caption text-text-muted m-0">{{ catalog.t('space.notePlaceholder') }}</p>
          }
          <div class="flex items-center gap-2" *peraCan="PERM.crm.briefs.manage">
            @if (isLocked()) {
              <pera-button variant="secondary" size="sm" (click)="createCorrection()">{{
                catalog.t('space.createCorrection')
              }}</pera-button>
            } @else {
              <pera-button variant="secondary" size="sm" (click)="startEdit()">{{
                catalog.t('space.edit')
              }}</pera-button>
            }
          </div>
        }
      </div>
    </section>
  `,
})
export class CrmSpaceBriefNoteComponent {
  protected readonly store = inject(SpacesStore);
  protected readonly catalog = inject(CatalogService);
  private readonly modal = inject(ModalService);
  private readonly toast = inject(ToastService);
  protected readonly PERM = PERM;

  readonly space = input.required<CrmSpace>();
  readonly projectId = input.required<string>();

  readonly editing = signal(false);
  readonly text = signal('');

  readonly entry = computed(() => this.store.currentEntryFor(this.space().id));
  readonly isLocked = computed(() => this.entry()?.approvalStatus === ApprovalState.Approved);

  chip(entry: { approvalStatus: ApprovalState }) {
    return trustChip(entry.approvalStatus, false);
  }

  startEdit(): void {
    this.text.set(this.entry()?.requirements ?? '');
    this.editing.set(true);
  }

  save(): void {
    // Toast the real outcome, never the intent — a rejected save must not read as success.
    this.store.saveSpaceNote(this.space(), this.text().trim(), {
      onDone: () =>
        this.toast.show({ tone: 'success', message: this.catalog.t('space.noteSaved') }),
      onError: (err, fallback) =>
        this.toast.show({
          tone: 'danger',
          message: this.catalog.t(domainErrorKey(err.code, fallback)),
        }),
    });
    this.editing.set(false);
  }

  async createCorrection(): Promise<void> {
    const entry = this.entry();
    if (!entry) return;
    const ok = await this.modal
      .open<boolean>(CrmSupersedeEntryModalComponent, {
        size: 'lg',
        data: { projectId: this.projectId(), entry },
      })
      .afterClosed();
    if (ok) this.store.loadBrief();
  }
}
