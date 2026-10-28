import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { catchError, of } from 'rxjs';
import { CrmDesignProfileService } from '../../data/crm-design-profile.service';
import { CrmPeriodService } from '../../data/crm-period.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import {
  RequirementCategory,
  RequirementPeriodStatus,
  RequirementPriority,
} from '../../model/crm-enums';
import type {
  ClientDesignProfile,
  DesignProfileBriefHead,
  DesignProfileItem,
  DesignProfileSpace,
} from '../../model';
import {
  PeraAlertComponent,
  PeraBreadcrumbsComponent,
  PeraCardComponent,
  PeraEmptyComponent,
  PeraPageHeaderComponent,
  PeraSpinnerComponent,
} from '@ds';
import { formatHeadDiffValue, headDiffFieldLabel } from '../client/head-diff-format';

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

/** The exact order+field-name `DesignProfileBriefHead` carries — NO `ExpectedBudget`, ever (FR-018). */
const BRIEF_HEAD_FIELD_ORDER: Array<[string, keyof DesignProfileBriefHead]> = [
  ['UnitType', 'unitType'],
  ['UnitCondition', 'unitCondition'],
  ['Address', 'address'],
  ['FloorNo', 'floorNo'],
  ['UnitsPerFloor', 'unitsPerFloor'],
  ['AreaSqm', 'areaSqm'],
  ['BuildingKind', 'buildingKind'],
  ['IsLicensed', 'isLicensed'],
  ['Position', 'position'],
  ['ElevatorStatus', 'elevatorStatus'],
  ['UtilityMetersNote', 'utilityMetersNote'],
  ['ReceivesFrequentVisitors', 'receivesFrequentVisitors'],
  ['VisitorsNote', 'visitorsNote'],
  ['ParentsHobbies', 'parentsHobbies'],
  ['ChildrenHobbies', 'childrenHobbies'],
  ['HobbiesInDesign', 'hobbiesInDesign'],
  ['UsedDesignerBefore', 'usedDesignerBefore'],
  ['DesignerExperience', 'designerExperience'],
  ['DesignerExperienceReason', 'designerExperienceReason'],
  ['HiringReasons', 'hiringReasons'],
  ['PreferredStyle', 'preferredStyle'],
  ['PreferredColors', 'preferredColors'],
  ['FurnitureStatus', 'furnitureStatus'],
  ['TimelinePressure', 'timelinePressure'],
  ['ArchitecturalRequests', 'architecturalRequests'],
  ['OtherNeeds', 'otherNeeds'],
];

interface RoomGroup {
  room: string | null;
  items: DesignProfileItem[];
}
interface CategoryGroup {
  category: RequirementCategory;
  rooms: RoomGroup[];
}
interface BriefHeadRow {
  label: string;
  value: string;
}

/**
 * The designer profile (T120–T127, FR-030) — client metadata + primary contact,
 * the approved brief, approved items grouped by category and room, and
 * attachments of confirmed artifacts. **Read-only throughout — no write
 * affordance anywhere on this screen.**
 *
 * Zero money (FR-018) and zero unconfirmed content (FR-019) are enforced
 * SERVER-SIDE (`GetClientDesignProfileQueryHandler`) — this component renders
 * exactly what arrives and never re-filters or re-derives either exclusion
 * (T125/T126). `ClientDesignProfile`'s docblock has the full verification.
 * Field labels/values reuse `head-diff-format.ts` (B6b) rather than a third
 * copy of the same enum-translation table.
 *
 * The open-period banner (T123) is the one thing this screen fetches
 * separately (`CrmPeriodService.list`, gated `crm.periods.read`) — a pure
 * `crm.design_profile.read` grant without `crm.periods.read` simply won't show it;
 * that failure is swallowed rather than surfaced as an error on an otherwise-fine page.
 */
@Component({
  selector: 'app-crm-design-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PeraAlertComponent,
    PeraBreadcrumbsComponent,
    PeraCardComponent,
    PeraEmptyComponent,
    PeraPageHeaderComponent,
    PeraSpinnerComponent,
  ],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    <pera-page-header [title]="catalog.t('nav.dProfile')">
      <div toolbar>
        <pera-breadcrumbs
          [items]="[
            { label: catalog.t('crumb.dash'), route: '/crm/projects/' + projectId },
            { label: catalog.t('crumb.dProfile') },
          ]"
        />
      </div>
      <div actions class="fs-caption text-text-secondary">{{ catalog.t('dp.sub') }}</div>
    </pera-page-header>

    <div class="p-6 flex flex-col gap-4">
      @if (loading() && !profile()) {
        <div class="flex justify-center py-8"><pera-spinner /></div>
      } @else if (error()) {
        <pera-alert tone="warning">{{ error() }}</pera-alert>
      } @else if (profile(); as p) {
        @if (openPeriodClosesAtUtc(); as closesAtUtc) {
          <pera-alert tone="info">
            <span class="font-medium">{{ catalog.t('dp.openT') }}</span>
            {{ catalog.t('dp.openBanner', { date: whenLabel(closesAtUtc) }) }}
          </pera-alert>
        }

        <pera-card>
          <div class="flex flex-col gap-2 p-1">
            <span class="font-semibold fs-body-sm text-text-primary">{{
              catalog.t('client.identityData')
            }}</span>
            <dl class="flex flex-col gap-1 fs-body-sm m-0">
              @if (p.client.fullName) {
                <div class="flex justify-between gap-3">
                  <dt class="text-text-secondary">{{ catalog.t('client.lbl') }}</dt>
                  <dd class="text-text-primary m-0">{{ p.client.fullName }}</dd>
                </div>
              }
              @if (p.client.jobTitle) {
                <div class="flex justify-between gap-3">
                  <dt class="text-text-secondary">{{ catalog.t('brief.fJob') }}</dt>
                  <dd class="text-text-primary m-0">{{ p.client.jobTitle }}</dd>
                </div>
              }
              @if (p.client.maritalStatus) {
                <div class="flex justify-between gap-3">
                  <dt class="text-text-secondary">{{ catalog.t('brief.fMarital') }}</dt>
                  <dd class="text-text-primary m-0">{{ p.client.maritalStatus }}</dd>
                </div>
              }
              @if (p.client.address) {
                <div class="flex justify-between gap-3">
                  <dt class="text-text-secondary">{{ catalog.t('brief.fAddress') }}</dt>
                  <dd class="text-text-primary m-0 text-end">{{ p.client.address }}</dd>
                </div>
              }
              @if (p.client.children.length) {
                <div class="flex justify-between gap-3">
                  <dt class="text-text-secondary">{{ catalog.t('brief.fChildren') }}</dt>
                  <dd class="text-text-primary m-0">{{ childrenLabel(p.client.children) }}</dd>
                </div>
              }
            </dl>
          </div>
        </pera-card>

        @if (p.primaryContact; as pc) {
          <pera-card>
            <div class="flex flex-col gap-2 p-1">
              <span class="font-semibold fs-body-sm text-text-primary">{{
                catalog.t('client.primaryChip')
              }}</span>
              <div class="fs-body-sm text-text-primary">{{ pc.firstName }} {{ pc.lastName }}</div>
              @if (pc.email) {
                <div class="fs-caption text-text-secondary" dir="ltr">{{ pc.email }}</div>
              }
              @if (pc.phone) {
                <div class="fs-caption text-text-secondary" dir="ltr">{{ pc.phone }}</div>
              }
            </div>
          </pera-card>
        }

        @if (briefHeadRows(); as rows) {
          @if (rows.length) {
            <pera-card>
              <div class="flex flex-col gap-2 p-1">
                <span class="font-semibold fs-body-sm text-text-primary">{{
                  catalog.t('dp.briefT')
                }}</span>
                <dl class="flex flex-col gap-1 fs-body-sm m-0">
                  @for (row of rows; track row.label) {
                    <div class="flex justify-between gap-3">
                      <dt class="text-text-secondary">{{ row.label }}</dt>
                      <dd class="text-text-primary m-0 text-end">{{ row.value }}</dd>
                    </div>
                  }
                </dl>
              </div>
            </pera-card>
          }
        }

        @if (p.spaces.length) {
          @for (space of p.spaces; track space.id) {
            <pera-card>
              <div class="flex flex-col gap-2 p-1">
                <span class="font-semibold fs-body-sm text-text-primary" dir="auto">{{
                  spaceName(space)
                }}</span>
                @if (space.requirements) {
                  <p class="fs-body-sm text-text-secondary m-0" dir="auto">
                    {{ space.requirements }}
                  </p>
                }
              </div>
            </pera-card>
          }
        }

        <pera-card>
          <div class="flex flex-col gap-3 p-1">
            <div>
              <span class="font-semibold fs-body-sm text-text-primary">{{
                catalog.t('dp.itemsT')
              }}</span>
              <p class="fs-caption text-text-secondary m-0">{{ catalog.t('dp.itemsSub') }}</p>
            </div>
            @if (categoryGroups().length) {
              @for (group of categoryGroups(); track group.category) {
                <div class="flex flex-col gap-2">
                  <span class="fs-label uppercase tracking-wide text-text-muted font-semibold">{{
                    catalog.t(categoryLabel(group.category))
                  }}</span>
                  @for (roomGroup of group.rooms; track roomGroup.room) {
                    <div class="flex flex-col gap-1">
                      <span class="fs-caption text-text-secondary">{{
                        roomGroup.room || catalog.t('brief.room')
                      }}</span>
                      <ul class="flex flex-col gap-1 m-0 p-0 list-none">
                        @for (item of roomGroup.items; track item.id) {
                          <li
                            class="flex items-center justify-between gap-2 p-2 border border-border fs-body-sm"
                          >
                            <span class="text-text-primary">{{ item.title }}</span>
                            <span class="fs-label text-text-muted">{{
                              catalog.t(priorityLabel(item.priority))
                            }}</span>
                          </li>
                        }
                      </ul>
                    </div>
                  }
                </div>
              }
            } @else {
              <pera-empty [title]="catalog.t('dp.itemsT')" />
            }
          </div>
        </pera-card>

        <pera-card>
          <div class="flex flex-col gap-2 p-1">
            <span class="font-semibold fs-body-sm text-text-primary">{{
              catalog.t('common.attachments')
            }}</span>
            <p class="fs-caption text-text-secondary m-0">{{ catalog.t('dp.attachSub') }}</p>
            @if (p.attachments.length) {
              <ul class="flex flex-col gap-1 m-0 p-0 list-none">
                @for (a of p.attachments; track a.linkId) {
                  <li class="fs-body-sm text-text-primary truncate">{{ a.fileName }}</li>
                }
              </ul>
            } @else {
              <pera-empty [title]="catalog.t('common.attachments')" />
            }
          </div>
        </pera-card>

        <pera-card>
          <div class="flex flex-col gap-1 p-1">
            <span class="font-semibold fs-body-sm text-text-primary">{{
              catalog.t('dp.hiddenT')
            }}</span>
            <p class="fs-caption text-text-secondary m-0">{{ catalog.t('dp.hiddenBGeneric') }}</p>
          </div>
        </pera-card>
      }
    </div>
  `,
})
export class CrmDesignProfileComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CrmDesignProfileService);
  private readonly periodApi = inject(CrmPeriodService);
  protected readonly catalog = inject(CatalogService);

  protected projectId = '';

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly profile = signal<ClientDesignProfile | null>(null);
  protected readonly openPeriodClosesAtUtc = signal<string | null>(null);

  protected readonly briefHeadRows = computed<BriefHeadRow[]>(() => {
    const head = this.profile()?.briefHead;
    if (!head) return [];
    return BRIEF_HEAD_FIELD_ORDER.map(([field, prop]) => {
      const raw = head[prop];
      return {
        field,
        raw: raw === null || raw === undefined ? null : String(raw),
      };
    })
      .filter((r) => r.raw !== null)
      .map((r) => ({
        label: headDiffFieldLabel(r.field, this.catalog),
        value: formatHeadDiffValue(r.field, r.raw, this.catalog),
      }));
  });

  protected readonly categoryGroups = computed<CategoryGroup[]>(() => {
    const p = this.profile();
    if (!p) return [];
    return Object.entries(p.itemsByCategory)
      .map(([category, items]) => ({
        category: Number(category) as RequirementCategory,
        rooms: this.groupByRoom(items ?? []),
      }))
      .filter((g) => g.rooms.length)
      .sort((a, b) => a.category - b.category);
  });

  constructor() {
    this.projectId = this.route.snapshot.paramMap.get('projectId') ?? '';
    this.load();
  }

  protected spaceName(space: DesignProfileSpace): string {
    if (!space.space) return this.catalog.t('brief.general');
    return this.catalog.locale() === 'ar'
      ? space.space.spaceType.nameAr || space.space.name
      : space.space.name;
  }

  private load(): void {
    this.loading.set(true);
    this.api.getFor(this.projectId).subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load the design profile.');
        this.loading.set(false);
      },
    });

    this.periodApi
      .list(this.projectId)
      .pipe(catchError(() => of([])))
      .subscribe((periods) => {
        const open = periods.find((per) => per.status === RequirementPeriodStatus.Open);
        this.openPeriodClosesAtUtc.set(open?.closesAtUtc ?? null);
      });
  }

  private groupByRoom(items: DesignProfileItem[]): RoomGroup[] {
    const groups = new Map<string, DesignProfileItem[]>();
    for (const item of items) {
      const key = item.room ?? '';
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    return [...groups.entries()].map(([room, list]) => ({ room: room || null, items: list }));
  }

  protected categoryLabel(c: RequirementCategory): CatalogKey {
    return CATEGORY_LABEL_KEYS[c];
  }
  protected priorityLabel(p: RequirementPriority): CatalogKey {
    return PRIORITY_LABEL_KEYS[p];
  }

  protected childrenLabel(children: { gender: string; age: number }[]): string {
    return children
      .map(
        (c) =>
          `${c.gender === 'M' ? this.catalog.t('dp.childBoy') : this.catalog.t('dp.childGirl')} · ${c.age}`,
      )
      .join(', ');
  }

  protected whenLabel(iso: string): string {
    return formatCairoDateTime(iso, this.catalog.locale());
  }
}
