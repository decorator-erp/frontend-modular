import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PeraIconComponent } from '@ds';
import { RouteHistoryService } from '@platform/navigation/route-history.service';

interface Destination {
  label: string;
  sub: string;
  route: string;
}

@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PeraIconComponent],
  template: `
    <!-- Translated from G-07 in PERA App - Utility.html (.e404-wrap / .e404-mark / .e404-h / .e404-sub / .e404-sug) -->
    <div
      class="bg-bg flex-1 flex flex-col items-center justify-center px-4 md:px-6 lg:px-8 py-14 min-h-[var(--h-panel)]"
    >
      <!-- .e404-mark — light grey PERA mark -->
      <span class="relative w-9 h-9 mb-4" aria-hidden="true">
        <span
          class="absolute inset-0 border-[length:var(--hairline-strong)] border-border-strong"
        ></span>
        <span class="absolute top-1/2 inset-x-0 h-px bg-border-strong"></span>
        <span
          class="absolute start-1/2 inset-y-0 w-px bg-border-strong -translate-x-[calc(var(--hairline)*0.5)]"
        ></span>
      </span>
      <!-- .e404-h -->
      <h1 class="m-0 fs-h2 font-semibold tracking-tight mb-1.5 text-center">
        This page no longer exists, or you don't have access to it.
      </h1>
      <!-- .e404-sub -->
      <p class="m-0 fs-body-sm text-text-secondary mb-7 max-w-[42ch] text-center">
        The page may have been moved, archived, or never existed.
      </p>

      <!-- .e404-sug — 3-col suggestion grid -->
      <div
        class="w-full max-w-[var(--w-prose)] grid grid-cols-1 md:grid-cols-3 border border-border bg-surface rounded-card"
      >
        <!-- Recent screens -->
        <div class="p-5 border-e border-border-soft last:border-e-0">
          <div
            class="font-mono fs-micro uppercase tracking-[0.03em] text-text-muted mb-3 flex items-center gap-1.5"
          >
            <pera-icon name="eye" [size]="11" /> Recent screens
          </div>
          @for (url of history.recent(); track url; let i = $index) {
            <a
              [routerLink]="url"
              class="flex items-start gap-2 py-1.5 border-b border-border-soft last:border-b-0 cursor-pointer"
            >
              <span class="font-mono fs-micro text-text-muted w-3 shrink-0">{{ i + 1 }}</span>
              <span class="fs-caption text-accent hover:underline truncate">{{ url }}</span>
            </a>
          } @empty {
            <p class="m-0 fs-caption text-text-muted">No screens visited this session.</p>
          }
        </div>
        <!-- Popular destinations -->
        <div class="p-5 border-e border-border-soft last:border-e-0">
          <div
            class="font-mono fs-micro uppercase tracking-[0.03em] text-text-muted mb-3 flex items-center gap-1.5"
          >
            <pera-icon name="arrow-right" [size]="11" /> Popular destinations
          </div>
          @for (dest of destinations; track dest.route) {
            <a
              [routerLink]="dest.route"
              class="flex items-start gap-2 py-1.5 border-b border-border-soft last:border-b-0"
            >
              <span class="flex flex-col">
                <span class="fs-caption text-accent hover:underline">{{ dest.label }}</span>
                <span class="font-mono fs-micro text-text-muted">{{ dest.sub }}</span>
              </span>
            </a>
          }
        </div>
        <!-- Get help -->
        <div class="p-5">
          <div
            class="font-mono fs-micro uppercase tracking-[0.03em] text-text-muted mb-3 flex items-center gap-1.5"
          >
            <pera-icon name="info" [size]="11" /> Get help
          </div>
          <button
            type="button"
            (click)="backToDashboard()"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 mt-1 bg-accent text-text-on-accent fs-caption font-medium cursor-pointer hover:bg-accent-hover"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  `,
})
export class NotFoundComponent {
  private readonly router = inject(Router);
  readonly history = inject(RouteHistoryService);

  readonly destinations: Destination[] = [
    { label: 'Dashboard', sub: "Today's work & approvals", route: '/dashboard' },
    { label: 'Projects', sub: 'Active studio projects', route: '/projects' },
    { label: 'Employees', sub: 'Studio directory', route: '/employees' },
    { label: 'Clients', sub: 'Client directory', route: '/clients' },
  ];

  backToDashboard(): void {
    void this.router.navigate(['/dashboard']);
  }
}
