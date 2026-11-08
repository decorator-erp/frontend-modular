import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ToastService } from '@platform/feedback/toast.service';
import { CanDirective } from '@platform/permissions';
import { StageTemplatesService } from '../../data/stage-templates.service';
import { StageTemplateRef } from '../../model/stage-template.model';
import { ConfirmService, ModalService, PeraEmptyComponent, PeraSkeletonComponent } from '@ds';
import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import {
  StageTemplateFormDialogComponent,
  StageTemplateFormDialogData,
} from './stage-template-form-dialog.component';

@Component({
  selector: 'app-stage-templates-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanDirective, PeraEmptyComponent, PeraSkeletonComponent],
  templateUrl: './stage-templates-list.component.html',
})
export class StageTemplatesListComponent implements OnInit {
  private readonly api = inject(StageTemplatesService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly errors = inject(ErrorHandlerService);
  protected readonly catalog = inject(CatalogService);
  readonly deleting = signal(false);

  /** crmp P-11: delete a custom template; `stage_templates.InUse` shows its catalog reason. */
  async remove(t: StageTemplateRef): Promise<void> {
    if (this.deleting()) return;
    const ok = await this.confirm.open({
      title: this.catalog.t('tpl.deleteTitle'),
      body: this.catalog.t('tpl.deleteBody', { name: t.name }),
      confirmLabel: this.catalog.t('tpl.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    this.deleting.set(true);
    this.api.remove(t.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.toast.show({ tone: 'success', message: this.catalog.t('tpl.deleted') });
        this.templates.update((list) => list.filter((x) => x.id !== t.id));
        if (this.selectedId() === t.id) this.selectedId.set(null);
      },
      error: (err: HttpErrorResponse) => {
        this.deleting.set(false);
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
      },
    });
  }

  readonly loading = signal(true);
  readonly templates = signal<StageTemplateRef[]>([]);
  readonly selectedId = signal<string | null>(null);

  readonly selected = computed(
    () => this.templates().find((t) => t.id === this.selectedId()) ?? null,
  );
  readonly defaultCount = computed(() => this.templates().filter((t) => t.isDefault).length);
  readonly activeCount = computed(() => this.templates().filter((t) => t.isActive).length);

  ngOnInit(): void {
    this.load();
  }

  private load(selectId?: string): void {
    this.api.list().subscribe({
      next: (list) => {
        this.templates.set(list);
        this.loading.set(false);
        const wanted = selectId ?? this.selectedId();
        const keep = wanted ? list.find((t) => t.id === wanted) : undefined;
        this.selectedId.set((keep ?? list[0])?.id ?? null);
      },
      error: () => this.loading.set(false),
    });
  }

  select(t: StageTemplateRef): void {
    this.selectedId.set(t.id);
  }

  /** System templates are immutable (backend 409) — the template view hides Edit for them. */
  isSystem(t: StageTemplateRef): boolean {
    return (t.type ?? '').toLowerCase() === 'system';
  }

  async openEditor(t: StageTemplateRef): Promise<void> {
    if (this.isSystem(t)) {
      this.toast.show({ tone: 'info', message: 'System templates cannot be edited.' });
      return;
    }
    const data: StageTemplateFormDialogData = {
      id: t.id,
      initial: { name: t.name, description: t.description, isDefault: t.isDefault },
    };
    const ref = this.modal.open<boolean>(StageTemplateFormDialogComponent, { size: 'md', data });
    if (await ref.afterClosed()) this.load(t.id);
  }

  async openCreate(): Promise<void> {
    const ref = this.modal.open<boolean>(StageTemplateFormDialogComponent, { size: 'md' });
    if (await ref.afterClosed()) this.load();
  }

  duplicate(t: StageTemplateRef): void {
    this.toast.show({ tone: 'info', message: 'Duplicate coming soon' });
  }
}
