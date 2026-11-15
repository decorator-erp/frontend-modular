import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import {
  ConfirmService,
  ModalService,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraSelectComponent,
  PeraSkeletonComponent,
  SelectOption,
} from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { CanDirective, PERM } from '@platform/permissions';
import { FileTemplatesService } from '../../data/file-templates.service';
import {
  FILE_TEMPLATE_CATEGORIES,
  FileTemplate,
  FileTemplateCategory,
} from '../../model/file-template.model';
import {
  FILE_TEMPLATE_ERRORS,
  FileTemplateFormDialogComponent,
  FileTemplateFormDialogData,
} from './file-template-form-dialog.component';

/**
 * Sync F3: `/library/file-templates` — the file template library (dms FileTemplateEndpoints.cs).
 * Reading needs `file_templates.read` (the route guard); create, edit, activate, deactivate and
 * delete need `file_templates.manage`.
 */
@Component({
  selector: 'app-file-templates-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    FormsModule,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraSelectComponent,
    PeraSkeletonComponent,
  ],
  template: `
    <div class="bg-bg min-h-full">
      <header
        class="px-4 md:px-6 lg:px-7 pt-5 pb-3.5 border-b border-border bg-surface flex items-start gap-4"
      >
        <div class="flex-1 min-w-0">
          <h1 class="m-0 fs-h2 font-semibold tracking-tight leading-tight">
            {{ t('ftpl.title') }}
          </h1>
          <p class="m-0 mt-1 fs-caption text-text-secondary">{{ t('ftpl.subtitle') }}</p>
          <div class="font-mono fs-label text-text-muted mt-1.5" data-count>
            {{ t('ftpl.count', { n: templates().length, a: activeCount() }) }}
          </div>
        </div>
        <div class="w-48">
          <pera-select
            size="sm"
            [options]="categoryOptions"
            [ariaLabel]="t('ftpl.category')"
            [ngModel]="category()"
            (ngModelChange)="setCategory($event)"
            data-filter
          />
        </div>
        <pera-button *peraCan="perm" variant="primary" (click)="openCreate()" data-new>{{
          t('ftpl.new')
        }}</pera-button>
      </header>

      @if (loading()) {
        <div class="p-6"><pera-skeleton [height]="320" rounded="md" /></div>
      } @else if (failed()) {
        <div class="p-6 flex flex-col items-start gap-3" data-load-failed>
          <p class="m-0 fs-caption text-danger">{{ t('ftpl.loadFailed') }}</p>
          <pera-button variant="secondary" (click)="load()">{{ t('ftpl.retry') }}</pera-button>
        </div>
      } @else if (!templates().length) {
        <pera-empty [title]="t('ftpl.empty')" [description]="t('ftpl.emptyBody')" />
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr>
                @for (h of headers; track h) {
                  <th
                    class="text-start font-mono fs-micro text-text-muted font-medium px-3.5 py-2.5 border-b border-border bg-surface whitespace-nowrap"
                  >
                    {{ t(h) }}
                  </th>
                }
                <th class="px-3.5 py-2.5 border-b border-border bg-surface"></th>
              </tr>
            </thead>
            <tbody>
              @for (tp of templates(); track tp.id) {
                <tr [attr.data-template]="tp.id">
                  <td class="px-3.5 py-2.5 border-b border-border-soft align-middle">
                    <div class="fs-caption font-medium">{{ tp.name }}</div>
                    @if (tp.description) {
                      <div class="fs-micro text-text-muted mt-0.5 truncate">
                        {{ tp.description }}
                      </div>
                    }
                  </td>
                  <td class="px-3.5 py-2.5 border-b border-border-soft align-middle fs-caption">
                    {{ t('ftpl.cat.' + tp.category) }}
                  </td>
                  <td class="px-3.5 py-2.5 border-b border-border-soft align-middle">
                    <div class="fs-caption truncate">{{ tp.fileName }}</div>
                    <div class="font-mono fs-micro text-text-muted">{{ size(tp.sizeBytes) }}</div>
                  </td>
                  <td class="px-3.5 py-2.5 border-b border-border-soft align-middle">
                    <span
                      class="inline-flex items-center font-mono fs-micro px-1.5 py-0.5 border"
                      [class.text-success]="tp.isActive"
                      [class.border-success]="tp.isActive"
                      [class.text-text-muted]="!tp.isActive"
                      [class.border-border]="!tp.isActive"
                      data-status
                      >{{ t(tp.isActive ? 'ftpl.active' : 'ftpl.inactive') }}</span
                    >
                  </td>
                  <td class="px-3.5 py-2.5 border-b border-border-soft align-middle text-end">
                    <span class="inline-flex gap-3" *peraCan="perm">
                      <button
                        type="button"
                        class="font-mono fs-label text-accent hover:underline cursor-pointer"
                        (click)="openEdit(tp)"
                        data-edit
                      >
                        {{ t('ftpl.edit') }}
                      </button>
                      <button
                        type="button"
                        class="font-mono fs-label text-accent hover:underline cursor-pointer"
                        (click)="toggle(tp)"
                        data-toggle
                      >
                        {{ t(tp.isActive ? 'ftpl.deactivate' : 'ftpl.activate') }}
                      </button>
                      <button
                        type="button"
                        class="font-mono fs-label text-danger hover:underline cursor-pointer"
                        (click)="remove(tp)"
                        data-delete
                      >
                        {{ t('ftpl.delete') }}
                      </button>
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class FileTemplatesListComponent implements OnInit {
  private readonly api = inject(FileTemplatesService);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly catalog = inject(CatalogService);

  readonly perm = PERM.fileTemplates.manage;
  readonly headers: CatalogKey[] = ['ftpl.name', 'ftpl.category', 'ftpl.file', 'ftpl.status'];
  readonly categoryOptions: SelectOption[] = [
    { value: '', label: this.t('ftpl.allCategories') },
    ...FILE_TEMPLATE_CATEGORIES.map((c) => ({ value: c, label: this.t(`ftpl.cat.${c}`) })),
  ];

  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly templates = signal<FileTemplate[]>([]);
  readonly category = signal<FileTemplateCategory | ''>('');
  readonly activeCount = computed(() => this.templates().filter((x) => x.isActive).length);

  ngOnInit(): void {
    this.load();
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.catalog.t(key as CatalogKey, params);
  }

  size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  setCategory(value: FileTemplateCategory | '' | null): void {
    this.category.set(value ?? '');
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.list(this.category() || null).subscribe({
      next: (list) => {
        this.templates.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  async openCreate(): Promise<void> {
    await this.openDialog({});
  }

  async openEdit(template: FileTemplate): Promise<void> {
    await this.openDialog({ template });
  }

  private async openDialog(data: FileTemplateFormDialogData): Promise<void> {
    const ref = this.modal.open<boolean>(FileTemplateFormDialogComponent, { size: 'md', data });
    if (await ref.afterClosed()) {
      this.toast.show({ tone: 'success', message: this.t('ftpl.saved') });
      this.load();
    }
  }

  toggle(template: FileTemplate): void {
    const call = template.isActive
      ? this.api.deactivate(template.id)
      : this.api.activate(template.id);
    this.run(call, template.isActive ? 'ftpl.deactivated' : 'ftpl.activated');
  }

  async remove(template: FileTemplate): Promise<void> {
    const ok = await this.confirm.open({
      title: this.t('ftpl.deleteTitle', { name: template.name }),
      body: this.t('ftpl.deleteBody'),
      confirmLabel: this.t('ftpl.delete'),
      cancelLabel: this.t('ftpl.dlg.cancel'),
      tone: 'danger',
    });
    if (ok) this.run(this.api.remove(template.id), 'ftpl.deleted');
  }

  private run(call: Observable<unknown>, success: CatalogKey): void {
    call.subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: this.t(success) });
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        const parsed = this.errors.parse(err);
        const key = parsed.code ? FILE_TEMPLATE_ERRORS[parsed.code] : undefined;
        this.toast.show({ tone: 'danger', message: key ? this.t(key) : friendly(parsed) });
      },
    });
  }
}
