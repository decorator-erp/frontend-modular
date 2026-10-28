import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { CanDirective, PERM } from '@platform/permissions';
import {
  PeraAlertComponent,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraSelectComponent,
  SelectOption,
} from '@ds';
import { BriefStore } from '../../stores/brief.store';
import { UNIT_CONDITION_KEYS, UNIT_TYPE_KEYS } from './brief-head.component';

/**
 * The "no brief yet" state (009b #10): a 404 `crm.briefs.NotFound` on the stage's brief. "Create
 * brief" posts the stage's head; unit type and condition default to `0` ("from the lead intake"),
 * which the server seeds on the project's first brief, else answers `crm.briefs.UnitDetailsRequired`.
 */
@Component({
  selector: 'app-crm-brief-create',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    CanDirective,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraFormFieldComponent,
    PeraSelectComponent,
  ],
  host: { class: 'block' },
  template: `
    <div class="bg-surface border border-border rounded-card p-4 flex flex-col gap-4">
      <div>
        <div class="font-semibold text-text-primary">{{ catalog.t('brief.noBrief') }}</div>
        <p class="fs-caption text-text-secondary m-0">
          {{ catalog.t(stageId() ? 'brief.noBriefSub' : 'brief.pickStage') }}
        </p>
      </div>
      @if (stageId(); as stage) {
        <div class="flex flex-col gap-3" *peraCan="PERM.crm.briefs.manage">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <pera-form-field [label]="catalog.t('brief.fUnitType')">
              <pera-select
                [options]="unitTypeOptions"
                [ngModel]="unitType()"
                (ngModelChange)="unitType.set($event)"
              />
            </pera-form-field>
            <pera-form-field [label]="catalog.t('brief.fCondition')">
              <pera-select
                [options]="unitConditionOptions"
                [ngModel]="unitCondition()"
                (ngModelChange)="unitCondition.set($event)"
              />
            </pera-form-field>
          </div>
          @if (store.error()) {
            <pera-alert tone="danger">{{ store.error() }}</pera-alert>
          }
          <div class="flex justify-end">
            <pera-button variant="primary" [loading]="store.creating()" (click)="create(stage)">{{
              catalog.t('brief.createBrief')
            }}</pera-button>
          </div>
        </div>
      }
    </div>
  `,
})
export class CrmBriefCreateComponent {
  protected readonly catalog = inject(CatalogService);
  protected readonly store = inject(BriefStore);
  protected readonly PERM = PERM;

  /** The selected stage; `null` = none picked, so there is nothing to create a brief for. */
  readonly stageId = input<string | null>(null);

  protected readonly unitTypeOptions = this.options(UNIT_TYPE_KEYS);
  protected readonly unitConditionOptions = this.options(UNIT_CONDITION_KEYS);
  protected readonly unitType = signal('0');
  protected readonly unitCondition = signal('0');

  private options(keys: Record<number, CatalogKey>): SelectOption[] {
    return [
      { value: '0', label: this.catalog.t('brief.fromIntake') },
      ...Object.keys(keys)
        .map(Number)
        .map((value) => ({ value: String(value), label: this.catalog.t(keys[value]) })),
    ];
  }

  protected create(stageId: string): void {
    this.store.createBrief(stageId, {
      unitType: Number(this.unitType()),
      unitCondition: Number(this.unitCondition()),
    });
  }
}
