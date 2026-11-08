import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { VariationService } from '../../data/variation.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { MarkdownService } from '@shared/markdown/markdown.service';
import { VariationResponse } from '../../model/variation.model';
import { CatalogService } from '@platform/i18n/catalog.service';
import { SignVariationRequest } from '../../model/variation.model';
import {
  VariationSignDialogComponent,
  VariationSignDialogData,
} from './variation-sign-dialog.component';
import {
  ModalService,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraSkeletonComponent,
  PeraTextareaComponent,
  PeraTooltipDirective,
} from '@ds';

/**
 * Variation detail + lifecycle page — §F-VAR.4.
 * Renders Draft → Submitted → Approved/Rejected → (Signed) → Applied with
 * always-visible action buttons (disabled with tooltip when not allowed).
 */
@Component({
  selector: 'app-variation-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraFormFieldComponent,
    PeraSkeletonComponent,
    PeraTextareaComponent,
    PeraTooltipDirective,
  ],
  template: `
    <div class="px-8 py-6 max-w-[var(--w-form)] mx-auto">
      @if (loading()) {
        <pera-skeleton [height]="220" rounded="md" />
      } @else if (variation(); as v) {
        <header class="mb-5">
          <div class="font-mono fs-label uppercase text-text-muted mb-1">
            <a
              [routerLink]="['/finance/projects', v.projectId, 'variations']"
              class="hover:text-text-primary no-underline"
              >VARIATIONS</a
            >
            <span class="mx-2">·</span><span>{{ v.kind }}</span>
          </div>
          <h1 class="m-0 fs-h2 font-semibold">{{ v.reason }}</h1>
          <div
            class="mt-2 inline-flex items-center gap-2 font-mono fs-label uppercase px-2 py-1 border border-border bg-bg"
          >
            {{ v.status }}
          </div>
        </header>

        @if (alert(); as a) {
          <pera-alert tone="danger" class="block mb-4">{{ a }}</pera-alert>
        }

        <section class="border border-border bg-surface p-5 mb-5">
          <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 fs-caption">
            <dt class="font-mono fs-micro uppercase text-text-muted">Amount</dt>
            <dd class="m-0 tabular-nums">{{ v.amount }}</dd>
            @if (v.budgetedAmount) {
              <dt class="font-mono fs-micro uppercase text-text-muted">Budgeted</dt>
              <dd class="m-0 tabular-nums">{{ v.budgetedAmount }}</dd>
            }
            @if (v.chosenAmount) {
              <dt class="font-mono fs-micro uppercase text-text-muted">Chosen</dt>
              <dd class="m-0 tabular-nums">{{ v.chosenAmount }}</dd>
            }
            <dt class="font-mono fs-micro uppercase text-text-muted">Requested by</dt>
            <dd class="m-0">{{ v.requestedById }}</dd>
            @if (v.approvedById) {
              <dt class="font-mono fs-micro uppercase text-text-muted">Approved by</dt>
              <dd class="m-0">{{ v.approvedById }}</dd>
            }
            @if (v.resolutionNote) {
              <dt class="font-mono fs-micro uppercase text-text-muted">Resolution</dt>
              <dd class="m-0">{{ v.resolutionNote }}</dd>
            }
          </dl>
        </section>

        @if (v.status === 'Draft') {
          <section class="border border-border bg-surface p-5 mb-5">
            <h3 class="m-0 mb-3 fs-body-sm font-semibold">Description</h3>
            <form [formGroup]="descForm" (ngSubmit)="saveDescription()" class="flex flex-col gap-3">
              <pera-form-field label="Description" [required]="true">
                <pera-textarea formControlName="description" [rows]="5" />
              </pera-form-field>
              <div class="flex justify-end">
                <pera-button type="submit" variant="primary" [disabled]="descForm.invalid || busy()"
                  >Save description</pera-button
                >
              </div>
            </form>
          </section>
        } @else if (v.description) {
          <section class="border border-border bg-surface p-5 mb-5">
            <h3 class="m-0 mb-3 fs-body-sm font-semibold">Description</h3>
            <div
              class="md-out m-0 fs-caption text-text-secondary leading-relaxed"
              [innerHTML]="md.render(v.description)"
            ></div>
          </section>
        }

        <!-- Lifecycle action row — every action always visible, disabled with reason when not allowed -->
        <section class="border border-border bg-surface p-5">
          <h3 class="m-0 mb-3 fs-body-sm font-semibold">Lifecycle</h3>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="lc-btn"
              [disabled]="!can('submit')"
              [peraTooltip]="reason('submit')"
              (click)="run('submit')"
            >
              Submit
            </button>
            <button
              type="button"
              class="lc-btn"
              [disabled]="!can('approve')"
              [peraTooltip]="reason('approve')"
              (click)="run('approve')"
            >
              Approve
            </button>
            <button
              type="button"
              class="lc-btn"
              [disabled]="!can('sign')"
              [peraTooltip]="reason('sign')"
              (click)="run('sign')"
            >
              Sign
            </button>
            <button
              type="button"
              class="lc-btn"
              [disabled]="!can('apply')"
              [peraTooltip]="reason('apply')"
              (click)="run('apply')"
            >
              Apply
            </button>
            <button
              type="button"
              class="lc-btn danger"
              [disabled]="!can('reject')"
              [peraTooltip]="reason('reject')"
              (click)="run('reject')"
            >
              Reject
            </button>
            <button
              type="button"
              class="lc-btn danger"
              [disabled]="!can('cancel')"
              [peraTooltip]="reason('cancel')"
              (click)="run('cancel')"
            >
              Cancel
            </button>
          </div>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .lc-btn {
        appearance: none;
        background: var(--surface);
        border: 1px solid var(--color-border);
        padding: 7px 14px;
        font-size: 12px;
        cursor: pointer;
      }
      .lc-btn:hover:not(:disabled) {
        background: var(--color-hover, var(--color-border-soft));
      }
      .lc-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .lc-btn.danger {
        color: var(--color-danger, var(--color-error));
        border-color: var(--color-danger, var(--color-error));
      }
    `,
  ],
})
export class VariationDetailComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(VariationService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  protected readonly md = inject(MarkdownService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modal = inject(ModalService);
  protected readonly catalog = inject(CatalogService);

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly alert = signal<string | null>(null);
  readonly variation = signal<VariationResponse | null>(null);

  readonly descForm = this.fb.group({
    // Sync S4: the backend caps the description at 512 characters (400 above).
    description: ['', [Validators.required, Validators.maxLength(512)]],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.load(id);
  }

  load(id: string): void {
    this.loading.set(true);
    this.api.getById(id).subscribe({
      next: (v) => {
        this.variation.set(v);
        this.descForm.patchValue({ description: v.description ?? '' });
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /**
   * Sync W1-7 (dms Finance.Domain/Variation.cs Approve): a Submitted ClientDifference is approved BY
   * the client's signature — Sign (with the client and the signed document), never a bare Approve
   * (`SignatureRequired`). A Submitted InternalChange is approved with no signature. Apply follows
   * approval for both kinds.
   */
  can(action: 'submit' | 'approve' | 'sign' | 'apply' | 'reject' | 'cancel'): boolean {
    const s = this.variation()?.status;
    if (!s || this.busy()) return false;
    const client = this.variation()?.kind === 'ClientDifference';
    switch (action) {
      case 'submit':
        return s === 'Draft';
      case 'approve':
        return s === 'Submitted' && !client;
      case 'sign':
        return s === 'Submitted' && client;
      case 'apply':
        return s === 'Approved';
      case 'reject':
        return s === 'Submitted';
      case 'cancel':
        return s === 'Draft' || s === 'Submitted';
    }
  }

  reason(action: string): string {
    if (this.can(action as never)) return '';
    const v = this.variation();
    if (action === 'approve' && v?.status === 'Submitted' && v.kind === 'ClientDifference') {
      return this.catalog.t('var.sign.needsSignature');
    }
    const s = v?.status ?? 'Unknown';
    return `Not allowed in status ${s}.`;
  }

  /** Sign: collect the client and the signed document, then `PUT …/sign`. */
  async sign(): Promise<void> {
    const v = this.variation();
    if (!v || !this.can('sign')) return;
    const data: VariationSignDialogData = { projectId: v.projectId };
    const req = await this.modal
      .open<SignVariationRequest | null>(VariationSignDialogComponent, { size: 'md', data })
      .afterClosed();
    if (req) this.execute('sign', v.id, this.api.sign(v.id, req));
  }

  run(action: 'submit' | 'approve' | 'sign' | 'apply' | 'reject' | 'cancel'): void {
    const v = this.variation();
    if (!v || !this.can(action)) return;
    if (action === 'sign') {
      void this.sign();
      return;
    }
    const call$: Observable<unknown> =
      action === 'submit'
        ? this.api.submit(v.id)
        : action === 'approve'
          ? this.api.approve(v.id)
          : action === 'apply'
            ? this.api.apply(v.id)
            : action === 'reject'
              ? this.api.reject(v.id)
              : this.api.cancel(v.id);
    this.execute(action, v.id, call$);
  }

  private execute(action: string, id: string, call$: Observable<unknown>): void {
    this.busy.set(true);
    this.alert.set(null);
    call$.subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: `Variation ${action}` });
        this.busy.set(false);
        this.load(id);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.alert.set(friendly(this.errors.parse(err)));
      },
    });
  }

  saveDescription(): void {
    const v = this.variation();
    if (!v || this.descForm.invalid) return;
    this.busy.set(true);
    this.api
      .setDescription(v.id, { description: this.descForm.value.description!.trim() })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.toast.show({ tone: 'success', message: 'Description saved' });
          this.load(v.id);
        },
        error: (err: HttpErrorResponse) => {
          this.busy.set(false);
          this.alert.set(friendly(this.errors.parse(err)));
        },
      });
  }
}
