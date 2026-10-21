import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-server-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Translated from G-08 in PERA App - Utility.html (.err-wrap / .err-state.err-type / .err-brand / .err-ref / .err-acts) -->
    <div class="bg-bg flex-1 overflow-y-auto p-10">
      <div
        class="max-w-[var(--w-prose)] mx-auto p-10 border border-border bg-surface border-s-[length:var(--border-accent)] border-s-danger"
      >
        <!-- .err-brand -->
        <div class="flex items-center gap-2 mb-7">
          <span class="relative w-7 h-7 shrink-0" aria-hidden="true">
            <span
              class="absolute inset-0 border-[length:var(--hairline-strong)] border-text-primary"
            ></span>
            <span class="absolute top-1/2 inset-x-0 h-px bg-text-primary"></span>
            <span
              class="absolute start-1/2 inset-y-0 w-px bg-text-primary -translate-x-[calc(var(--hairline)*0.5)]"
            ></span>
          </span>
          <span class="fs-body font-semibold">PERA</span>
        </div>
        <h1 class="m-0 fs-h3 font-semibold tracking-tight leading-snug mb-2">
          Something on our side went wrong.
        </h1>
        <p class="m-0 fs-body-sm text-text-secondary leading-relaxed mb-4">
          Our team has been notified. Try again in a moment, or reload this page.
        </p>
        <!-- .err-ref — mono code ref -->
        <div
          class="inline-flex items-center gap-2 font-mono fs-label bg-bg border border-border px-2.5 py-1.5 mb-4 select-all"
        >
          <span>ERR-{{ refDate }}-{{ refCode }}</span>
          <span class="text-text-muted">Reference</span>
        </div>
        <!-- .err-status -->
        <div
          class="inline-flex items-center gap-1.5 font-mono fs-micro border border-border px-2 py-0.5 text-text-secondary mb-4
                    before:content-[''] before:w-1.5 before:h-1.5 before:bg-success before:rounded-full ms-2"
        >
          Status investigated
        </div>

        <!-- .err-acts -->
        <div class="flex gap-2 flex-wrap">
          <button
            type="button"
            (click)="retry()"
            class="inline-flex items-center gap-1.5 px-3 py-2 bg-accent text-text-on-accent fs-caption font-medium cursor-pointer hover:bg-accent-hover"
          >
            Retry
          </button>
          <button
            type="button"
            (click)="backToDashboard()"
            class="inline-flex items-center gap-1.5 px-3 py-2 border border-border bg-bg fs-caption cursor-pointer hover:bg-surface-muted"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ServerErrorComponent {
  private readonly router = inject(Router);

  // Static ref (real one would come from headers)
  readonly refDate = '2026-06-11';
  readonly refCode = '7F4A';

  retry(): void {
    window.location.reload();
  }

  backToDashboard(): void {
    void this.router.navigate(['/dashboard']);
  }
}
