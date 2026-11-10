import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';

/** A new client's portal login, as just created. Held in memory only — never stored. */
export interface IssuedLogin {
  email: string;
  password: string;
}

/**
 * LC-2: shows a just-created client's sign-in email and temporary password once, with copy
 * buttons, so the office can pass them on. Sending them by email is planned (the invitation flow,
 * gap-03); until then this is how the client gets their login.
 */
@Component({
  selector: 'app-login-credentials',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-3" data-login-credentials>
      <p class="m-0 fs-body-sm text-text-secondary">{{ catalog.t('creds.body') }}</p>
      @for (row of rows(); track row.key) {
        <div
          class="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2.5"
        >
          <span class="flex flex-col min-w-0 flex-1">
            <span class="fs-label uppercase tracking-wide text-text-muted">{{
              catalog.t(row.label)
            }}</span>
            <span
              class="fs-body font-medium text-text-primary break-all"
              dir="ltr"
              [attr.data-value]="row.key"
              >{{ row.value }}</span
            >
          </span>
          <button
            type="button"
            class="shrink-0 px-3 py-1.5 rounded-md border border-border bg-surface fs-caption font-semibold text-accent hover:bg-accent-soft cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
            [attr.data-copy]="row.key"
            (click)="copy(row.key, row.value)"
          >
            {{ copied() === row.key ? catalog.t('creds.copied') : catalog.t('creds.copy') }}
          </button>
        </div>
      }
      <button
        type="button"
        data-copy="both"
        class="self-start px-3 py-1.5 rounded-md fs-caption font-semibold text-accent hover:underline cursor-pointer"
        (click)="copy('both', bothText())"
      >
        {{ copied() === 'both' ? catalog.t('creds.copied') : catalog.t('creds.copyBoth') }}
      </button>
      <p class="m-0 rounded-lg bg-warning-soft px-3 py-2 fs-caption text-text-primary" role="note">
        {{ catalog.t('creds.once') }} {{ catalog.t('creds.later') }}
      </p>
    </div>
  `,
})
export class LoginCredentialsComponent {
  readonly catalog = inject(CatalogService);
  readonly login = input.required<IssuedLogin>();
  readonly copied = signal<string | null>(null);

  rows(): { key: string; label: 'creds.email' | 'creds.password'; value: string }[] {
    return [
      { key: 'email', label: 'creds.email', value: this.login().email },
      { key: 'password', label: 'creds.password', value: this.login().password },
    ];
  }

  bothText(): string {
    return `${this.catalog.t('creds.email')}: ${this.login().email}\n${this.catalog.t('creds.password')}: ${this.login().password}`;
  }

  async copy(key: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.copied.set(key);
    } catch {
      // No clipboard access (an older browser or a blocked permission): the value stays on screen.
      this.copied.set(null);
    }
  }
}
