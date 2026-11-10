import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '@platform/auth/auth.store';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { LocaleService } from '@platform/i18n/locale.service';
import { ParsedApiError } from '@platform/types';
import { PeraValidators, firstErrorMessage } from '@shared/forms/validators';
import { ServerErrorsDirective } from '@shared/forms/server-errors.directive';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PeraIconComponent } from '@ds';
import { ThemeService } from '@platform/theme';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    ServerErrorsDirective,
    PeraIconComponent,
  ],
  templateUrl: './login.component.html',
  // LG-1: the floor plan draws itself in once; plain lines for anyone who prefers reduced motion.
  styles: `
    .login-plan {
      opacity: 0.45;
    }
    .plan-wall {
      fill: none;
      stroke: currentColor;
      stroke-width: 7;
      stroke-linecap: square;
    }
    .plan-thin {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.4;
    }
    .plan-dim {
      fill: none;
      stroke: var(--color-text-muted);
      stroke-width: 1;
    }
    .plan-label {
      fill: var(--color-text-muted);
      font-size: var(--fs-label);
      font-weight: 600;
      letter-spacing: 0.08em;
    }
    .plan-room {
      fill: currentColor;
      font-size: var(--fs-caption);
      font-weight: 600;
      letter-spacing: 0.16em;
    }
    .draw {
      stroke-dasharray: 2400;
      stroke-dashoffset: 2400;
      animation: plan-draw 2.6s ease forwards;
    }
    @keyframes plan-draw {
      to {
        stroke-dashoffset: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .draw {
        animation: none;
        stroke-dashoffset: 0;
      }
    }
  `,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  readonly errorHandler = inject(ErrorHandlerService);
  readonly locale = inject(LocaleService);
  readonly catalog = inject(CatalogService);
  /** LG-1: applies the saved light/dark choice here too — the shell that usually does is not loaded yet. */
  private readonly theme = inject(ThemeService);

  /** LG-1: the eye button in the password field. */
  readonly showPassword = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, PeraValidators.email]],
    password: ['', [Validators.required]],
    remember: [true],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  errorOf(name: 'email' | 'password'): string {
    const c = this.form.get(name);
    return c && c.touched && c.errors ? firstErrorMessage(c.errors) : '';
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.serverError.set(null);
    try {
      await this.auth.login({
        email: this.form.controls.email.value,
        password: this.form.controls.password.value,
      });
      if (this.auth.isAuthenticated()) {
        const url = new URL(window.location.href);
        // A client user always lands in the client shell (FR-038) — never `/dashboard`,
        // and never a `returnUrl` left over from an office link they followed pre-login.
        const returnUrl = this.auth.isClient()
          ? '/portal'
          : url.searchParams.get('returnUrl') || '/dashboard';
        await this.router.navigateByUrl(returnUrl);
      } else if (this.auth.error()) {
        this.serverError.set({
          status: 401,
          generalMessage: this.auth.error()!,
          fieldErrors: {},
          code: null,
          raw: null,
        });
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
