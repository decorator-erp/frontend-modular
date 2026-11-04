import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CanDirective, PERM } from '@platform/permissions';
import { isClientAuthoredItem } from '../../data/crm-item.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import {
  ApprovalState,
  RequirementCategory,
  RequirementPeriodStatus,
  RequirementPriority,
  RequirementSource,
} from '../../model/crm-enums';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import type { RequirementItem } from '../../model';
import { isLocked, isUnconfirmed, trustChip } from '../trust/trust-chip';
import {
  ModalService,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraPageHeaderComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
} from '@ds';
import { ItemsStore } from '../../stores/items.store';
import { PeriodStore } from '../../stores/period.store';
import { CrmItemFormComponent, ItemFormMode } from './item-form.component';

const CATEGORY_LABEL_KEYS: Record<RequirementCategory, CatalogKey> = {
  [RequirementCategory.SpaceLayout]: 'item.catLayout',
  [RequirementCategory.Style]: 'item.catSelStyle',
  [RequirementCategory.ColorPalette]: 'item.catSelColorPalette',
  [RequirementCategory.Materials]: 'item.catSelMaterials',
  [RequirementCategory.Furniture]: 'item.catFurn1',
  [RequirementCategory.Lighting]: 'item.catLighting',
  [RequirementCategory.Budget]: 'item.catSelBudget',
  [RequirementCategory.Timeline]: 'item.catSelTimeline',
  [RequirementCategory.Technical]: 'item.catSelTechnical',
  [RequirementCategory.Other]: 'common.other',
};

const PRIORITY_LABEL_KEYS: Record<RequirementPriority, CatalogKey> = {
  [RequirementPriority.Low]: 'item.prLow',
  [RequirementPriority.Medium]: 'item.prMed',
  [RequirementPriority.High]: 'item.prHigh',
  [RequirementPriority.Urgent]: 'item.prUrgent',
};

const SOURCE_LABEL_KEYS: Record<RequirementSource, CatalogKey> = {
  [RequirementSource.Meeting]: 'item.srcMeeting',
  [RequirementSource.Brief]: 'item.srcBrief',
  [RequirementSource.Note]: 'item.srcNote',
  [RequirementSource.ClientDirect]: 'client.lbl',
};

/**
 * The requirement-items board (T083–T086) — **grouped by category** (FR-024a); each row
 * shows room, source, priority and status. A client-authored row renders Trusted + a
 * Client source chip and NEVER Draft/Pending (FR-012, the one trust-rule asymmetry) —
 * `isLocked()` already folds that in.
 *
 * Single-host again: `/crm/projects/:projectId/items`, where the aggregate root lives.
 * It was briefly embeddable (an `embedded` input suppressing the page header and the
 * `ngOnInit` load) so the Client Hub's Gathering tab could host a second copy; that tab
 * is now a read-only summary that links here instead, so the input is gone. The route
 * keeps providing `ItemsStore`/`PeriodStore` — see `crm.routes.ts`.
 */
@Component({
  selector: 'app-crm-items-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraPageHeaderComponent,
    PeraSkeletonComponent,
    PeraStatusBadgeComponent,
  ],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    <pera-page-header [title]="catalog.t('nav.items')">
      <div actions>
        <pera-button variant="primary" *peraCan="PERM.crm.items.create" (click)="openAdd()">{{
          catalog.t('nav.itemForm')
        }}</pera-button>
      </div>
    </pera-page-header>

    <div class="p-6 flex flex-col gap-4">
      @if (store.notFound()) {
        <!-- FINDING-5-6 (X-5): a 404 on load is "not found", never "Could not load". -->
        <pera-alert tone="warning">{{ catalog.t('period.notFound') }}</pera-alert>
      }
      @if (store.error(); as error) {
        <pera-alert tone="danger">{{ error }}</pera-alert>
      }
      @if (store.loading()) {
        <pera-skeleton [height]="200" />
      } @else {
        @for (group of store.groupedByCategory(); track group.category) {
          <div class="bg-surface border border-border rounded-card">
            <div class="px-4 py-3 border-b border-border font-semibold text-text-primary">
              {{ catalog.t(categoryLabel(group.category)) }}
              <span class="fs-caption text-text-muted font-normal">({{ group.items.length }})</span>
            </div>
            <ul class="flex flex-col gap-2 p-4">
              @for (item of group.items; track item.id) {
                <li [class]="rowWrapperClass(item)" [attr.data-wm]="wmLabel(item)">
                  <div
                    [class]="isUnconfirmedRow(item) ? 'pera-unconfirmed-content' : ''"
                    class="flex items-center justify-between gap-3 flex-wrap p-2 border border-border rounded-sm"
                  >
                    <div class="min-w-0 flex-1">
                      <div class="text-text-primary font-medium">{{ item.title }}</div>
                      <div class="fs-caption text-text-secondary flex items-center gap-2 flex-wrap">
                        @if (item.room) {
                          <span>{{ item.room }}</span>
                        }
                        <span class="fs-label text-text-muted">{{
                          catalog.t(priorityLabel(item.priority))
                        }}</span>
                        @if (item.sourceType !== null) {
                          <span class="fs-label text-text-muted">{{
                            catalog.t(sourceLabel(item.sourceType))
                          }}</span>
                        }
                      </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <pera-status-badge
                        [tone]="chipFor(item).tone"
                        [label]="catalog.t(chipFor(item).key)"
                      />
                      @if (isClientAuthored(item)) {
                        <pera-status-badge tone="success" [label]="catalog.t('client.lbl')" />
                      }
                      @if (!isSupersededRow(item)) {
                        <div class="flex items-center gap-1.5">
                          @if (isLockedRow(item)) {
                            <button
                              *peraCan="PERM.crm.items.supersede"
                              type="button"
                              class="fs-caption text-accent cursor-pointer underline outline-none focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed"
                              [disabled]="isPeriodClosed(item)"
                              [attr.title]="closedTitle(item)"
                              (click)="openSupersede(item)"
                            >
                              {{ catalog.t('trust.newVersion') }}
                            </button>
                          } @else {
                            <button
                              *peraCan="PERM.crm.items.update"
                              type="button"
                              class="fs-caption text-text-secondary cursor-pointer underline outline-none focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed"
                              [disabled]="isPeriodClosed(item)"
                              [attr.title]="closedTitle(item)"
                              (click)="openEdit(item)"
                            >
                              {{ catalog.t('common.edit') }}
                            </button>
                            @if (item.approvalStatus === APPROVAL_STATE.Draft) {
                              <button
                                *peraCan="PERM.crm.items.send"
                                type="button"
                                class="fs-caption text-accent cursor-pointer underline outline-none focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed"
                                [disabled]="isPeriodClosed(item)"
                                [attr.title]="closedTitle(item)"
                                (click)="store.send(item.id)"
                              >
                                {{ catalog.t('appr.sendConfirm') }}
                              </button>
                            }
                          }
                        </div>
                      }
                    </div>
                  </div>
                </li>
              }
            </ul>
          </div>
        }
      }
    </div>
  `,
})
export class CrmItemsBoardComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly modal = inject(ModalService);
  protected readonly catalog = inject(CatalogService);
  protected readonly store = inject(ItemsStore);
  private readonly period = inject(PeriodStore);
  protected readonly PERM = PERM;
  protected readonly APPROVAL_STATE = ApprovalState;

  private projectId = '';

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('projectId') ?? '';
    this.store.load(this.projectId);
    this.period.load(this.projectId);
  }

  protected categoryLabel(c: RequirementCategory): CatalogKey {
    return CATEGORY_LABEL_KEYS[c] ?? 'common.other';
  }
  protected priorityLabel(p: RequirementPriority): CatalogKey {
    return PRIORITY_LABEL_KEYS[p] ?? 'item.prMed';
  }
  protected sourceLabel(s: number): CatalogKey {
    return SOURCE_LABEL_KEYS[s as RequirementSource] ?? 'item.source';
  }

  /**
   * 009b #24: an item whose period is Closed takes no Send, Edit or Supersede (the server answers
   * 409 `crm.periods.NotOpen`), so those actions are disabled.
   */
  protected isPeriodClosed(item: RequirementItem): boolean {
    return this.period
      .periods()
      .some((p) => p.id === item.periodId && p.status === RequirementPeriodStatus.Closed);
  }

  protected closedTitle(item: RequirementItem): string | null {
    return this.isPeriodClosed(item) ? this.catalog.t('period.closed') : null;
  }

  protected isClientAuthored(item: RequirementItem): boolean {
    return isClientAuthoredItem(item);
  }

  protected chipFor(item: RequirementItem) {
    return trustChip(item.approvalStatus, this.isClientAuthored(item));
  }

  protected isLockedRow(item: RequirementItem): boolean {
    return isLocked(item.approvalStatus, this.isClientAuthored(item));
  }

  protected isUnconfirmedRow(item: RequirementItem): boolean {
    return isUnconfirmed(item.approvalStatus, this.isClientAuthored(item));
  }

  protected isSupersededRow(item: RequirementItem): boolean {
    return this.store.isSuperseded()(item);
  }

  protected wmLabel(item: RequirementItem): string | null {
    return this.isUnconfirmedRow(item) ? this.catalog.t('trust.unconfirmed') : null;
  }

  protected rowWrapperClass(item: RequirementItem): string {
    const classes: string[] = [];
    if (this.isUnconfirmedRow(item)) classes.push('pera-unconfirmed');
    if (this.isLockedRow(item)) classes.push('pera-locked');
    if (this.isSupersededRow(item)) classes.push('pera-superseded');
    return classes.join(' ');
  }

  protected async openAdd(): Promise<void> {
    await this.openForm('add');
  }

  protected async openEdit(item: RequirementItem): Promise<void> {
    await this.openForm('edit', item);
  }

  protected async openSupersede(item: RequirementItem): Promise<void> {
    await this.openForm('supersede', item);
  }

  private async openForm(mode: ItemFormMode, existing?: RequirementItem): Promise<void> {
    const projectId = this.store.projectId() ?? this.projectId;
    const period = existing?.periodId ?? this.period.openPeriod()?.id ?? '';
    await this.modal
      .open<boolean>(CrmItemFormComponent, {
        size: 'md',
        data: { projectId, periodId: period, mode, existing },
      })
      .afterClosed();
    this.store.load(projectId);
  }
}
