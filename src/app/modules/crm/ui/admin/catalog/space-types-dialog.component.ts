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
  PeraAlertComponent,
  PeraButtonComponent,
  PeraInputComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
  PeraSpinnerComponent,
} from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { CrmLookupService } from '../../../data/crm-lookup.service';
import type { CrmSpaceType } from '../../../model';

interface Draft {
  code: string;
  nameEn: string;
  nameAr: string;
  sortOrder: string;
}

const CODE = /^[a-z0-9_]{1,64}$/;

/**
 * Sync F4a: the space types admin (dms CrmSpaceTypeEndpoints.cs, `crm.space_types.manage`). Lists
 * every type, active or not, by order; adds one (`POST { code, nameEn, nameAr, sortOrder }`), edits
 * the names and order (`PUT /{id}`, the code is fixed) and switches it on or off (`PUT /{id}/active`).
 * Closes with `true` when anything changed, so the host re-reads its space types.
 */
@Component({
  selector: 'app-crm-space-types-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraInputComponent,
    PeraModalComponent,
    PeraModalFooterDirective,
    PeraSpinnerComponent,
  ],
  template: `
    <pera-modal [title]="t('stypes.title')" size="lg">
      <p class="m-0 mb-3 fs-caption text-text-secondary">{{ t('stypes.subtitle') }}</p>
      @if (error(); as message) {
        <pera-alert tone="danger" class="block mb-3" data-error>{{ message }}</pera-alert>
      }
      @if (loading()) {
        <div class="flex justify-center p-6"><pera-spinner /></div>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full border-collapse fs-caption">
            <thead>
              <tr class="text-start text-text-muted">
                <th class="text-start font-medium px-2 py-1.5 border-b border-border">
                  {{ t('stypes.code') }}
                </th>
                <th class="text-start font-medium px-2 py-1.5 border-b border-border">
                  {{ t('stypes.nameEn') }}
                </th>
                <th class="text-start font-medium px-2 py-1.5 border-b border-border">
                  {{ t('stypes.nameAr') }}
                </th>
                <th class="text-start font-medium px-2 py-1.5 border-b border-border w-20">
                  {{ t('stypes.sortOrder') }}
                </th>
                <th class="px-2 py-1.5 border-b border-border"></th>
              </tr>
            </thead>
            <tbody>
              @for (st of sorted(); track st.id) {
                <tr [attr.data-space-type]="st.code" [class.opacity-60]="st.isActive === false">
                  <td class="px-2 py-1.5 border-b border-border-soft font-mono" dir="ltr">
                    {{ st.code }}
                  </td>
                  @if (editingId() === st.id) {
                    <td class="px-2 py-1.5 border-b border-border-soft">
                      <pera-input
                        size="sm"
                        dir="ltr"
                        [ariaLabel]="t('stypes.nameEn')"
                        [ngModel]="edit().nameEn"
                        (ngModelChange)="patchEdit('nameEn', $event)"
                        data-edit-name-en
                      />
                    </td>
                    <td class="px-2 py-1.5 border-b border-border-soft">
                      <pera-input
                        size="sm"
                        dir="rtl"
                        [ariaLabel]="t('stypes.nameAr')"
                        [ngModel]="edit().nameAr"
                        (ngModelChange)="patchEdit('nameAr', $event)"
                        data-edit-name-ar
                      />
                    </td>
                    <td class="px-2 py-1.5 border-b border-border-soft">
                      <pera-input
                        size="sm"
                        type="number"
                        [ariaLabel]="t('stypes.sortOrder')"
                        [ngModel]="edit().sortOrder"
                        (ngModelChange)="patchEdit('sortOrder', $event)"
                        data-edit-order
                      />
                    </td>
                    <td class="px-2 py-1.5 border-b border-border-soft text-end whitespace-nowrap">
                      <pera-button
                        size="xs"
                        variant="primary"
                        [disabled]="busy()"
                        (click)="saveEdit(st)"
                        data-save-edit
                        >{{ t('stypes.save') }}</pera-button
                      >
                      <pera-button size="xs" variant="ghost" (click)="editingId.set(null)">{{
                        t('common.cancel')
                      }}</pera-button>
                    </td>
                  } @else {
                    <td class="px-2 py-1.5 border-b border-border-soft" dir="ltr">
                      {{ st.nameEn }}
                    </td>
                    <td class="px-2 py-1.5 border-b border-border-soft" dir="rtl">
                      {{ st.nameAr }}
                    </td>
                    <td class="px-2 py-1.5 border-b border-border-soft font-mono">
                      {{ st.sortOrder ?? 0 }}
                    </td>
                    <td class="px-2 py-1.5 border-b border-border-soft text-end whitespace-nowrap">
                      <span class="me-2 fs-micro text-text-muted" data-state>{{
                        t(st.isActive === false ? 'stypes.inactive' : 'stypes.active')
                      }}</span>
                      <button
                        type="button"
                        class="fs-caption text-accent hover:underline cursor-pointer me-2"
                        (click)="startEdit(st)"
                        data-edit
                      >
                        {{ t('common.edit') }}
                      </button>
                      <button
                        type="button"
                        class="fs-caption text-accent hover:underline cursor-pointer disabled:opacity-50"
                        [disabled]="busy()"
                        (click)="toggle(st)"
                        data-toggle
                      >
                        {{ t(st.isActive === false ? 'stypes.activate' : 'stypes.deactivate') }}
                      </button>
                    </td>
                  }
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="px-2 py-4 text-center text-text-muted">
                    {{ t('stypes.empty') }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <form
          class="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_var(--w-column)_auto] gap-2 items-end"
          (submit)="$event.preventDefault(); add()"
          data-add-form
        >
          <pera-input
            size="sm"
            dir="ltr"
            [placeholder]="t('stypes.code')"
            [ariaLabel]="t('stypes.code')"
            [ngModel]="draft().code"
            (ngModelChange)="patchDraft('code', $event)"
            name="code"
            data-new-code
          />
          <pera-input
            size="sm"
            dir="ltr"
            [placeholder]="t('stypes.nameEn')"
            [ariaLabel]="t('stypes.nameEn')"
            [ngModel]="draft().nameEn"
            (ngModelChange)="patchDraft('nameEn', $event)"
            name="nameEn"
            data-new-name-en
          />
          <pera-input
            size="sm"
            dir="rtl"
            [placeholder]="t('stypes.nameAr')"
            [ariaLabel]="t('stypes.nameAr')"
            [ngModel]="draft().nameAr"
            (ngModelChange)="patchDraft('nameAr', $event)"
            name="nameAr"
            data-new-name-ar
          />
          <pera-input
            size="sm"
            type="number"
            [placeholder]="t('stypes.sortOrder')"
            [ariaLabel]="t('stypes.sortOrder')"
            [ngModel]="draft().sortOrder"
            (ngModelChange)="patchDraft('sortOrder', $event)"
            name="sortOrder"
            data-new-order
          />
          <pera-button size="sm" variant="secondary" [disabled]="busy()" (click)="add()" data-add>{{
            t('stypes.add')
          }}</pera-button>
        </form>
        <p class="m-0 mt-1.5 fs-micro text-text-muted">{{ t('stypes.codeFixed') }}</p>
      }
      <div peraModalFooter class="flex justify-end w-full">
        <pera-button variant="ghost" (click)="close()">{{ t('docv.close') }}</pera-button>
      </div>
    </pera-modal>
  `,
})
export class CrmSpaceTypesDialogComponent implements OnInit {
  private readonly api = inject(CrmLookupService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly catalog = inject(CatalogService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly types = signal<CrmSpaceType[]>([]);
  readonly editingId = signal<string | null>(null);
  readonly edit = signal<Draft>({ code: '', nameEn: '', nameAr: '', sortOrder: '0' });
  readonly draft = signal<Draft>({ code: '', nameEn: '', nameAr: '', sortOrder: '0' });
  private changed = false;

  readonly sorted = computed(() =>
    [...this.types()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
  );

  ngOnInit(): void {
    this.load();
  }

  t(key: string): string {
    return this.catalog.t(key as CatalogKey);
  }

  load(): void {
    this.loading.set(true);
    this.api.spaceTypes().subscribe({
      next: (list) => {
        this.types.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.t('stypes.loadFailed'));
        this.loading.set(false);
      },
    });
  }

  patchDraft(field: keyof Draft, value: string | null): void {
    this.draft.update((d) => ({ ...d, [field]: value ?? '' }));
  }

  patchEdit(field: keyof Draft, value: string | null): void {
    this.edit.update((d) => ({ ...d, [field]: value ?? '' }));
  }

  startEdit(st: CrmSpaceType): void {
    this.error.set(null);
    this.editingId.set(st.id);
    this.edit.set({
      code: st.code,
      nameEn: st.nameEn,
      nameAr: st.nameAr,
      sortOrder: String(st.sortOrder ?? 0),
    });
  }

  /** The first problem with a draft, or `null`. */
  private problem(d: Draft, withCode: boolean): string | null {
    if (withCode && !CODE.test(d.code.trim())) return this.t('stypes.errCode');
    if (!d.nameEn.trim() || !d.nameAr.trim()) return this.t('stypes.errNames');
    const order = Number(d.sortOrder);
    if (d.sortOrder === '' || !Number.isInteger(order) || order < 0)
      return this.t('stypes.errOrder');
    return null;
  }

  add(): void {
    const d = this.draft();
    const problem = this.problem(d, true);
    this.error.set(problem);
    if (problem || this.busy()) return;
    this.run(
      this.api.createSpaceType({
        code: d.code.trim(),
        nameEn: d.nameEn.trim(),
        nameAr: d.nameAr.trim(),
        sortOrder: Number(d.sortOrder),
      }),
      () => this.draft.set({ code: '', nameEn: '', nameAr: '', sortOrder: '0' }),
    );
  }

  saveEdit(st: CrmSpaceType): void {
    const d = this.edit();
    const problem = this.problem(d, false);
    this.error.set(problem);
    if (problem || this.busy()) return;
    this.run(
      this.api.updateSpaceType(st.id, {
        nameEn: d.nameEn.trim(),
        nameAr: d.nameAr.trim(),
        sortOrder: Number(d.sortOrder),
      }),
      () => this.editingId.set(null),
    );
  }

  toggle(st: CrmSpaceType): void {
    if (this.busy()) return;
    this.error.set(null);
    this.run(this.api.setSpaceTypeActive(st.id, st.isActive === false), () => undefined);
  }

  close(): void {
    this.modalRef.close(this.changed);
  }

  private run(call: Observable<unknown>, after: () => void): void {
    this.busy.set(true);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.changed = true;
        after();
        this.toast.show({ tone: 'success', message: this.t('stypes.saved') });
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(friendly(this.errors.parse(err)));
      },
    });
  }
}
