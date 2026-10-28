import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  PERA_MODAL_DATA,
  PeraButtonComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
} from '@ds';
import { DocumentsTabComponent } from '../documents/documents-tab.component';

export interface DocumentationModalData {
  projectId: string;
  /** Crumb context (e.g. stage name) shown in the subtitle. */
  context?: string | null;
  /** Folder to open scoped on mount (`all` / null = the full browser). */
  initialFolder?: string | null;
}

/**
 * Documentation modal — hosts the existing project-documents browser
 * (`app-documents-tab`, `/api/project-documents`) in a `pera-modal` so the task
 * detail can open the full folder/file browser without leaving the page. Upload
 * is gated on `projects.manageDocuments` inside the tab itself.
 */
@Component({
  selector: 'app-documentation-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PeraModalComponent,
    PeraModalFooterDirective,
    PeraButtonComponent,
    DocumentsTabComponent,
  ],
  template: `
    <pera-modal title="Documentation" size="xl">
      @if (data.context) {
        <p class="m-0 mb-3 fs-label text-text-muted">{{ data.context }}</p>
      }
      <div class="min-h-[var(--h-scroll)]">
        <app-documents-tab
          [projectId]="data.projectId"
          [initialFolderId]="data.initialFolder ?? null"
        />
      </div>
      <div peraModalFooter class="flex justify-end">
        <pera-button variant="ghost" (click)="close()">Close</pera-button>
      </div>
    </pera-modal>
  `,
})
export class DocumentationModalComponent {
  readonly data = inject(PERA_MODAL_DATA) as DocumentationModalData;
  private readonly modalRef = inject(PeraModalRef);

  close(): void {
    this.modalRef.close();
  }
}
