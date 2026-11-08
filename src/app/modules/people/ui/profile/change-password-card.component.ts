import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PeraButtonComponent, PeraFormFieldComponent, PeraInputComponent } from '@ds';
import { AuthStore } from '@platform/auth/auth.store';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { PeraValidators } from '@shared/forms';
import { AccountService } from '../../data/account.service';

/** The rules the shared validator flags, plus the symbol the backend also requires. */
const NEEDS = ['minLength', 'lowercase', 'uppercase', 'digit', 'symbol'] as const;
type Need = (typeof NEEDS)[number];

/**
 * The unmet password rules. `PeraValidators.password` checks length, lower, upper and digit; dms
 * `IdentityPasswordPolicy` (Identity.Contracts) also requires a non-alphanumeric character, which the
 * shared validator leaves optional, so that one is checked here.
 */
export function unmetPasswordRules(password: string): Need[] {
  const flags =
    (PeraValidators.password(new FormControl(password))?.['password'] as
      Record<string, true> | undefined) ?? {};
  const unmet = NEEDS.filter((n) => n !== 'symbol' && flags[n]);
  if (password && !/[^A-Za-z0-9]/.test(password)) unmet.push('symbol');
  return password ? unmet : [...NEEDS];
}

/**
 * Sync F5: change the caller's password from the profile page (`POST /api/auth/change-password`,
 * dms AuthEndpoints.cs:65). The new password is checked against the same rules as the backend before
 * it is sent. A success ends every session server-side, so the card says so and signs the user out
 * to the login page. Refusals map to EN/AR messages: a wrong current password, a policy failure, a
 * validation 400, the rate limit.
 */
@Component({
  selector: 'app-change-password-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PeraButtonComponent, PeraFormFieldComponent, PeraInputComponent],
  template: `
    <form
      class="flex flex-col gap-3"
      (submit)="$event.preventDefault(); submit()"
      novalidate
      data-change-password
    >
      <h3 class="m-0 text-sm font-medium">{{ t('pwd.title') }}</h3>
      <p class="m-0 fs-caption text-text-secondary">{{ t('pwd.intro') }}</p>
      <pera-form-field [label]="t('pwd.current')" [required]="true" [error]="shown('current')">
        <pera-input
          type="password"
          autocomplete="current-password"
          name="current"
          [ngModel]="current()"
          (ngModelChange)="current.set($event ?? '')"
          [error]="shown('current')"
          data-current
        />
      </pera-form-field>
      <pera-form-field
        [label]="t('pwd.new')"
        [required]="true"
        [hint]="t('pwd.rules')"
        [error]="shown('next')"
      >
        <pera-input
          type="password"
          autocomplete="new-password"
          name="next"
          [ngModel]="next()"
          (ngModelChange)="next.set($event ?? '')"
          [error]="shown('next')"
          data-next
        />
      </pera-form-field>
      <pera-form-field [label]="t('pwd.confirm')" [required]="true" [error]="shown('confirm')">
        <pera-input
          type="password"
          autocomplete="new-password"
          name="confirm"
          [ngModel]="confirm()"
          (ngModelChange)="confirm.set($event ?? '')"
          [error]="shown('confirm')"
          data-confirm
        />
      </pera-form-field>
      @if (serverError(); as message) {
        <p class="m-0 fs-caption text-danger" role="alert" data-server-error>{{ message }}</p>
      }
      <div>
        <pera-button variant="secondary" [loading]="busy()" (click)="submit()" data-submit>{{
          t(busy() ? 'pwd.saving' : 'pwd.submit')
        }}</pera-button>
      </div>
    </form>
  `,
})
export class ChangePasswordCardComponent {
  private readonly api = inject(AccountService);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly catalog = inject(CatalogService);

  readonly current = signal('');
  readonly next = signal('');
  readonly confirm = signal('');
  readonly busy = signal(false);
  readonly serverError = signal<string | null>(null);
  private readonly attempted = signal(false);

  /** Field → message, or '' when valid. */
  readonly problems = computed<Record<'current' | 'next' | 'confirm', string>>(() => {
    const unmet = unmetPasswordRules(this.next());
    return {
      current: this.current() ? '' : this.t('pwd.err.currentRequired'),
      next: unmet.length
        ? this.t('pwd.err.needs', {
            list: unmet
              .map((n) => this.t(`pwd.need.${n}`))
              .join(this.catalog.locale() === 'ar' ? '، ' : ', '),
          })
        : this.next() === this.current()
          ? this.t('pwd.err.same')
          : '',
      confirm: this.confirm() === this.next() ? '' : this.t('pwd.err.mismatch'),
    };
  });

  t(key: string, params?: Record<string, string | number>): string {
    return this.catalog.t(key as CatalogKey, params);
  }

  shown(field: 'current' | 'next' | 'confirm'): string {
    return this.attempted() ? this.problems()[field] : '';
  }

  submit(): void {
    this.attempted.set(true);
    if (Object.values(this.problems()).some(Boolean) || this.busy()) return;
    this.busy.set(true);
    this.serverError.set(null);
    this.api.changePassword(this.current(), this.next()).subscribe({
      next: async () => {
        this.busy.set(false);
        this.toast.show({ tone: 'success', message: this.t('pwd.done') });
        // Every session ended server-side (revoked refresh tokens, new security stamp).
        await this.auth.logout();
        void this.router.navigate(['/login']);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.serverError.set(this.messageFor(err));
      },
    });
  }

  private messageFor(err: HttpErrorResponse): string {
    if (err.status === 429) return this.t('pwd.err.rateLimited');
    const parsed = this.errors.parse(err);
    if (parsed.code === 'authentications.ChangePasswordFailed') {
      // ASP.NET Identity's PasswordMismatch reads "Incorrect password."; anything else is a policy rule.
      return /incorrect password/i.test(parsed.generalMessage)
        ? this.t('pwd.err.incorrect')
        : this.t('pwd.err.policy');
    }
    if (err.status === 400) {
      const fields = Object.keys(parsed.fieldErrors).join(' ').toLowerCase();
      if (fields.includes('current')) return this.t('pwd.err.currentRequired');
      return this.t('pwd.err.policy');
    }
    return this.t('pwd.err.generic');
  }
}
