import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ModalService } from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { PERM, PermissionsService } from '@platform/permissions';
import { claimCheck } from '../../model/project-access';
import { ProjectAccessStore } from '../../stores/project-access.store';
import {
  ScopedFolderDialogComponent,
  ScopedFolderDialogData,
} from '../documents/scoped-folder-dialog.component';
import { ApplyFileTemplateDialogData, loadApplyFileTemplateDialog } from '@modules/library';

/**
 * Sync F3 + F2(e): the task page's extra file actions, kept out of the attachments panel — "Apply
 * template" (copy a file template into the task) and "New folder" (a task-scoped folder). Both
 * need `documents.upload` (the Documents area, for the task's stage). Emits `changed` after either,
 * so the page can reload its attachments.
 */
@Component({
  selector: 'app-task-file-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (canUpload()) {
      <div class="flex justify-end gap-2" data-task-file-actions>
        <button
          type="button"
          class="font-mono fs-label text-accent hover:underline cursor-pointer"
          (click)="newFolder()"
          data-task-folder
        >
          + {{ t('ftpl.taskFolder') }}
        </button>
        <button
          type="button"
          class="font-mono fs-label text-accent hover:underline cursor-pointer"
          (click)="applyTemplate()"
          data-apply-template
        >
          {{ t('ftpl.apply') }}
        </button>
      </div>
    }
  `,
})
export class TaskFileActionsComponent {
  readonly taskId = input.required<string>();
  readonly projectId = input.required<string>();
  readonly stageId = input<string | null>(null);
  readonly changed = output<void>();

  private readonly modal = inject(ModalService);
  private readonly perms = inject(PermissionsService);
  private readonly access = inject(ProjectAccessStore);
  private readonly catalog = inject(CatalogService);

  readonly canUpload = computed(() =>
    claimCheck(
      this.access.project(this.projectId())()?.myAccess,
      'Documents',
      (p) => this.perms.can(p),
      this.stageId() ?? undefined,
    )(PERM.documents.upload),
  );

  t(key: CatalogKey): string {
    return this.catalog.t(key);
  }

  async applyTemplate(): Promise<void> {
    const data: ApplyFileTemplateDialogData = { taskId: this.taskId() };
    const component = await loadApplyFileTemplateDialog();
    const ref = this.modal.open<boolean>(component, { size: 'sm', data });
    if (await ref.afterClosed()) this.changed.emit();
  }

  async newFolder(): Promise<void> {
    const data: ScopedFolderDialogData = { scope: 'task', scopeId: this.taskId() };
    const ref = this.modal.open<string>(ScopedFolderDialogComponent, { size: 'sm', data });
    if (await ref.afterClosed()) this.changed.emit();
  }
}
