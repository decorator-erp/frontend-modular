import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CanDirective, PERM } from '@platform/permissions';
import { CatalogService } from '@platform/i18n/catalog.service';
import { formatCairoDate } from '@platform/i18n/intl-locale';
import type { BriefSpace } from '../../model';
import { isLocked, isUnconfirmed, SUPERSEDED_CHIP, trustChip } from '../trust/trust-chip';
import {
  ModalService,
  PeraButtonComponent,
  PeraIconComponent,
  PeraStatusBadgeComponent,
} from '@ds';
import { BriefSpaceGroup, BriefStore } from '../../stores/brief.store';
import { CrmAddEntryFormComponent } from './add-entry-form.component';
import { CrmSupersedeEntryModalComponent } from './supersede-entry.modal';

/**
 * The ONE unified gathering-ledger card (T062, FR-024 + FR-024a). Since feature 006 an
 * entry is a thin wrapper — a room reference (or "General") plus free text; what was
 * recorded lives on the space's board, reached via "View board". Entries group by space.
 *
 * Trust treatments (T063/T064): `.pera-unconfirmed` (Draft/Pending), `.pera-locked`
 * (Approved — "New version…" REPLACES every edit affordance), `.pera-superseded`.
 */
@Component({
  selector: 'app-crm-gathering-ledger',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CanDirective,
    PeraButtonComponent,
    PeraIconComponent,
    PeraStatusBadgeComponent,
  ],
  host: { class: 'block' },
  template: `
    <div class="bg-surface border border-border rounded-card">
      <div
        class="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap"
      >
        <div>
          <div class="font-semibold text-text-primary">{{ catalog.t('brief.secLedgerT') }}</div>
          <p class="fs-caption text-text-secondary m-0">{{ catalog.t('brief.gatherLogSub') }}</p>
        </div>
        <div class="flex items-center gap-2" *peraCan="PERM.crm.briefs.manage">
          <pera-button variant="secondary" size="sm" (click)="openAddEntry()">{{
            catalog.t('brief.addEntry')
          }}</pera-button>
        </div>
      </div>

      <div class="divide-y divide-border">
        @for (group of store.groupedBySpace(); track groupKey(group)) {
          <div>
            <button
              type="button"
              class="w-full flex items-center gap-3 px-4 py-3 text-start cursor-pointer hover:bg-hover
                     outline-none focus-visible:outline-2 focus-visible:outline-accent"
              (click)="toggle(groupKey(group))"
            >
              <span class="font-medium text-text-primary flex-1" dir="auto">{{
                groupLabel(group)
              }}</span>
              @if (group.space) {
                <a
                  [routerLink]="['/crm/projects', projectId(), 'spaces']"
                  class="fs-caption text-accent hover:underline"
                  (click)="$event.stopPropagation()"
                  >{{ catalog.t('brief.viewBoard') }}</a
                >
              }
              <span class="fs-caption text-text-muted">{{ group.entries.length }}</span>
              <pera-icon
                [name]="isOpen(groupKey(group)) ? 'chevron-down' : 'chevron-right'"
                [size]="14"
                class="text-text-muted"
              />
            </button>

            @if (isOpen(groupKey(group))) {
              <ul class="flex flex-col gap-2 px-4 pb-3">
                @for (entry of group.entries; track entry.id) {
                  <li [class]="rowWrapperClass(entry)" [attr.data-wm]="wmLabel(entry)">
                    <div [class]="rowContentClass(entry)">
                      <div class="flex flex-col gap-1.5 p-2 border border-border rounded-sm">
                        <div class="flex items-center gap-2 flex-wrap">
                          <pera-status-badge
                            [tone]="chipFor(entry).tone"
                            [label]="catalog.t(chipFor(entry).key)"
                          />
                          <span class="fs-label text-text-muted" dir="ltr">{{
                            dateLabel(entry)
                          }}</span>
                          <span class="flex-1"></span>
                          @if (isSupersededEntry(entry)) {
                            <!-- trail only — no action on a superseded row -->
                          } @else if (isLockedEntry(entry)) {
                            <button
                              type="button"
                              class="fs-caption text-accent cursor-pointer underline outline-none focus-visible:outline-2 focus-visible:outline-accent"
                              *peraCan="PERM.crm.briefs.manage"
                              (click)="openSupersede(entry)"
                            >
                              {{ catalog.t('trust.newVersion') }}
                            </button>
                          } @else {
                            <button
                              type="button"
                              class="fs-caption text-text-secondary cursor-pointer underline outline-none focus-visible:outline-2 focus-visible:outline-accent"
                              *peraCan="PERM.crm.briefs.manage"
                              (click)="openEdit(entry)"
                            >
                              {{ catalog.t('common.edit') }}
                            </button>
                          }
                        </div>
                        @if (entry.requirements) {
                          <span class="fs-caption text-text-secondary" dir="auto">{{
                            entry.requirements
                          }}</span>
                        }
                      </div>
                    </div>
                  </li>
                }
              </ul>
            }
          </div>
        } @empty {
          <div class="px-4 py-6 text-center fs-body-sm text-text-muted">
            {{ catalog.t('brief.covNone') }}
          </div>
        }
      </div>
    </div>
  `,
})
export class CrmGatheringLedgerComponent {
  private readonly modal = inject(ModalService);
  protected readonly catalog = inject(CatalogService);
  protected readonly store = inject(BriefStore);
  protected readonly PERM = PERM;

  private readonly openGroups = signal<Set<string>>(new Set());

  protected projectId(): string {
    return this.store.head()?.projectId ?? '';
  }

  protected groupKey(group: BriefSpaceGroup): string {
    return group.space?.id ?? '__general__';
  }

  protected groupLabel(group: BriefSpaceGroup): string {
    return group.space ? group.space.name : this.catalog.t('brief.general');
  }

  protected isOpen(key: string): boolean {
    return this.openGroups().has(key);
  }

  protected toggle(key: string): void {
    const next = new Set(this.openGroups());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.openGroups.set(next);
  }

  protected chipFor(entry: BriefSpace) {
    if (this.isSupersededEntry(entry)) return SUPERSEDED_CHIP;
    return trustChip(entry.approvalStatus, false);
  }

  protected dateLabel(entry: BriefSpace): string {
    return formatCairoDate(entry.createdAtUtc, this.catalog.locale());
  }

  protected isLockedEntry(entry: BriefSpace): boolean {
    return isLocked(entry.approvalStatus, false);
  }

  protected isSupersededEntry(entry: BriefSpace): boolean {
    return this.store.spaces().some((s) => s.supersedesSpaceId === entry.id);
  }

  protected isUnconfirmedEntry(entry: BriefSpace): boolean {
    return isUnconfirmed(entry.approvalStatus, false);
  }

  protected wmLabel(entry: BriefSpace): string | null {
    return this.isUnconfirmedEntry(entry) ? this.catalog.t('trust.unconfirmed') : null;
  }

  protected rowWrapperClass(entry: BriefSpace): string {
    const classes: string[] = [];
    if (this.isUnconfirmedEntry(entry)) classes.push('pera-unconfirmed');
    if (this.isLockedEntry(entry)) classes.push('pera-locked');
    if (this.isSupersededEntry(entry)) classes.push('pera-superseded');
    return classes.join(' ');
  }

  protected rowContentClass(entry: BriefSpace): string {
    return this.isUnconfirmedEntry(entry) ? 'pera-unconfirmed-content' : '';
  }

  protected async openAddEntry(): Promise<void> {
    const head = this.store.head();
    if (!head) return;
    const ok = await this.modal
      .open<boolean>(CrmAddEntryFormComponent, {
        size: 'md',
        data: { projectId: head.projectId, briefId: head.id },
      })
      .afterClosed();
    if (ok) this.store.load(head.projectId);
  }

  protected async openEdit(entry: BriefSpace): Promise<void> {
    const head = this.store.head();
    if (!head) return;
    const ok = await this.modal
      .open<boolean>(CrmAddEntryFormComponent, {
        size: 'md',
        data: { projectId: head.projectId, briefId: head.id, existing: entry },
      })
      .afterClosed();
    if (ok) this.store.load(head.projectId);
  }

  protected async openSupersede(entry: BriefSpace): Promise<void> {
    const head = this.store.head();
    if (!head) return;
    const ok = await this.modal
      .open<boolean>(CrmSupersedeEntryModalComponent, {
        size: 'lg',
        data: { projectId: head.projectId, entry },
      })
      .afterClosed();
    if (ok) this.store.load(head.projectId);
  }
}
