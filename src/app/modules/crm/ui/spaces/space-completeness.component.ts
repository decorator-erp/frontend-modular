import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CrmSpace } from '../../model';
import { PeraIconComponent } from '@ds';
import { SpacesStore } from '../../stores/spaces.store';

/**
 * The space's completeness gaps — missing required branches, `Single` violations, and
 * items missing a required attribute. Each warning links into the picker.
 */
@Component({
  selector: 'app-crm-space-completeness',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraIconComponent],
  template: `
    <section class="bg-surface border border-border rounded-card">
      <header class="px-4 py-3 border-b border-border">
        <span class="fs-label uppercase tracking-wide text-text-muted">{{
          catalog.t('space.completeTitle')
        }}</span>
      </header>
      <div class="p-4 flex flex-col gap-2">
        @if (completeness(); as c) {
          @if (c.isComplete) {
            <div class="flex items-center gap-2 fs-caption text-success">
              <pera-icon name="check-circle" [size]="16" />
              <span>{{ catalog.t('space.complete') }}</span>
            </div>
          } @else {
            @for (branch of c.missingRequiredBranches; track branch.branchId) {
              <button
                type="button"
                class="text-start fs-caption text-warning hover:underline"
                (click)="record.emit()"
              >
                {{ catalog.t('space.missingBranch', { name: name(branch) }) }}
              </button>
            }
            @for (viol of c.singleViolations; track viol.branchId) {
              <span class="fs-caption text-danger">{{
                catalog.t('space.singleViolation', { name: name(viol), count: viol.recordedCount })
              }}</span>
            }
            @for (attr of c.missingRequiredAttributes; track attr.attributeId + attr.spaceItemId) {
              <button
                type="button"
                class="text-start fs-caption text-warning hover:underline"
                (click)="record.emit()"
              >
                {{ catalog.t('space.missingAttr', { name: name(attr) }) }}
              </button>
            }
          }
        }
      </div>
    </section>
  `,
})
export class CrmSpaceCompletenessComponent {
  private readonly store = inject(SpacesStore);
  protected readonly catalog = inject(CatalogService);

  readonly space = input.required<CrmSpace>();
  readonly record = output<void>();

  readonly completeness = computed(() => this.store.completeness(this.space().id));

  name(x: { nameEn: string; nameAr: string }): string {
    return this.catalog.locale() === 'ar' ? x.nameAr || x.nameEn : x.nameEn;
  }
}
