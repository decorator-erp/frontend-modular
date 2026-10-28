import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { PeraAlertComponent, PeraButtonComponent, PeraPageHeaderComponent } from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PERM, PermissionsService } from '@platform/permissions';
import { ScopeOfWorkStore } from '../../stores/scope-of-work.store';
import { SowItemsTableComponent, SowItemUpdate } from './sow-items-table.component';
import { SowTemplatePickerComponent } from './sow-template-picker.component';

/**
 * The project's scope of work (نطاق العمل) — NEW-FEATURE-1, specs/sow-scope-of-work.md.
 * Routed at `projects/:id/scope-of-work` behind `scope.read` (§3). `id` is the route param,
 * bound by `withComponentInputBinding()` (a param, so INHERITED-TRAP-1 does not bite).
 */
@Component({
  selector: 'app-scope-of-work-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PeraAlertComponent,
    PeraButtonComponent,
    PeraPageHeaderComponent,
    SowItemsTableComponent,
    SowTemplatePickerComponent,
  ],
  providers: [ScopeOfWorkStore],
  host: { class: 'block' },
  template: `
    <pera-page-header [title]="catalog.t('sow.title')" />
    <div class="px-8 py-6 flex flex-col gap-5">
      @if (store.error(); as error) {
        <pera-alert tone="danger">{{ error }}</pera-alert>
      }
      @if (store.scope()) {
        <section
          class="bg-surface border border-border p-5 flex flex-col gap-4 min-w-0"
          aria-labelledby="sow-items-heading"
        >
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <h2 id="sow-items-heading" class="m-0 fs-h3 font-semibold text-text-primary">
              {{ catalog.t('sow.items') }}
              <span class="text-text-muted font-medium">· {{ store.items().length }}</span>
            </h2>
            @if (editable()) {
              <pera-button
                iconStart="plus"
                [attr.aria-expanded]="pickerOpen()"
                (click)="togglePicker()"
              >
                {{ catalog.t(pickerOpen() ? 'sow.closeTemplates' : 'sow.addFromTemplates') }}
              </pera-button>
            }
          </div>
          @if (editable() && pickerOpen()) {
            <app-sow-template-picker
              [templates]="store.templates()"
              [selectedTemplateId]="store.selectedTemplateId()"
              [stages]="store.templateStages()"
              [pickedStageIds]="store.pickedStageIds()"
              [loading]="store.templatesLoading()"
              [busy]="store.saving()"
              (selectTemplate)="store.selectTemplate($event)"
              (addStage)="store.addStage($event)"
              (removeStage)="store.removeStage($event)"
              (addTemplate)="store.addTemplate($event)"
            />
          }
          <app-sow-items-table
            [items]="store.items()"
            [editable]="editable()"
            [confirmed]="store.isConfirmed()"
            [projectId]="id()"
            (updateItem)="onUpdateItem($event)"
            (reorder)="store.reorder($event)"
            (remove)="store.removeItem($event)"
          />
        </section>
      }
    </div>
  `,
})
export class ScopeOfWorkPageComponent implements OnInit {
  protected readonly catalog = inject(CatalogService);
  protected readonly store = inject(ScopeOfWorkStore);
  private readonly permissions = inject(PermissionsService);

  /** The project id (`:id`). */
  readonly id = input('');

  /** B15 `scope.manage`. */
  protected readonly canManage = computed(() => this.permissions.can(PERM.scope.manage));

  /** Edit controls render only with `scope.manage`, on a Draft of a Stage-workflow project. */
  protected readonly editable = computed(
    () =>
      this.canManage() &&
      !this.store.isConfirmed() &&
      this.store.project()?.workflowType !== 'FreeStyle',
  );

  /** B6: the template picker is open; templates are read on first open. */
  protected readonly pickerOpen = signal(false);

  ngOnInit(): void {
    this.store.load(this.id());
  }

  protected togglePicker(): void {
    const open = !this.pickerOpen();
    this.pickerOpen.set(open);
    if (open && this.store.templates().length === 0) this.store.loadTemplates();
  }

  protected onUpdateItem(update: SowItemUpdate): void {
    this.store.updateItem(update.itemId, update.request);
  }
}
