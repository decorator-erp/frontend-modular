import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { TemplateStage } from '@modules/library';
import type {
  ScopeOfWork,
  SowTemplateOption,
  UpdateScopeOfWorkHeaderRequest,
} from '../../model/scope-of-work.model';
import { SowItemsTableComponent, type SowItemUpdate } from './sow-items-table.component';
import { SowSummaryComponent } from './sow-summary.component';
import { SowTemplatePickerComponent } from './sow-template-picker.component';

/**
 * LC-1: the scope page's three presentational parts — template picker, items table and summary — on
 * a scope that is not saved anywhere yet. The lead-convert wizard (CRM) holds the scope and confirms it
 * as part of its own Create, so the summary's confirm block is hidden.
 *
 * Reached only through `loadSowDraftEditor()` in the projects barrel: exporting the components
 * themselves would put them, and everything they import, in the initial bundle.
 */
@Component({
  selector: 'app-sow-draft-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SowItemsTableComponent, SowSummaryComponent, SowTemplatePickerComponent],
  template: `
    <div class="flex flex-col gap-4">
      <app-sow-template-picker
        [templates]="templates()"
        [selectedTemplateId]="selectedTemplateId()"
        [stages]="templateStages()"
        [pickedStageIds]="pickedStageIds()"
        [loading]="loading()"
        (selectTemplate)="selectTemplate.emit($event)"
        (addStage)="addStage.emit($event)"
        (removeStage)="removeStage.emit($event)"
        (addTemplate)="addTemplate.emit($event)"
      />
      <app-sow-items-table
        [items]="scope().items"
        [editable]="true"
        (updateItem)="updateItem.emit($event)"
        (reorder)="reorder.emit($event)"
        (remove)="removeStage.emit($event)"
      />
      <app-sow-summary
        [scope]="scope()"
        [editable]="true"
        [showConfirm]="false"
        (headerChange)="headerChange.emit($event)"
      />
    </div>
  `,
})
export class SowDraftEditorComponent {
  readonly scope = input.required<ScopeOfWork>();
  readonly templates = input<SowTemplateOption[]>([]);
  readonly selectedTemplateId = input<string | null>(null);
  readonly templateStages = input<TemplateStage[]>([]);
  readonly pickedStageIds = input<readonly string[]>([]);
  readonly loading = input(false);

  readonly selectTemplate = output<string>();
  /** A template stage id. */
  readonly addStage = output<string>();
  /** A template stage id — the draft's item ids are their template stage ids. */
  readonly removeStage = output<string>();
  readonly addTemplate = output<string>();
  readonly updateItem = output<SowItemUpdate>();
  readonly reorder = output<string[]>();
  readonly headerChange = output<UpdateScopeOfWorkHeaderRequest>();
}
