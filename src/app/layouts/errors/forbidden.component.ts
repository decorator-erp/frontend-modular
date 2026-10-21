import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PeraButtonComponent, PeraCardComponent } from '@ds';

@Component({
  selector: 'app-forbidden',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraButtonComponent, PeraCardComponent],
  template: `
    <div class="flex items-center justify-center min-h-full p-6">
      <pera-card padding="lg" class="w-full max-w-130">
        <div class="flex flex-col items-center text-center gap-3 py-6">
          <span
            class="text-text-muted text-6xl font-light tracking-tight select-none"
            aria-hidden="true"
            >403</span
          >
          <h1 class="m-0 text-xl font-semibold">You don't have permission to view this page.</h1>
          <p class="m-0 text-sm text-text-secondary max-w-90">
            If you believe this is an error, contact your studio administrator.
          </p>
          <div class="flex items-center gap-2 mt-4 flex-wrap justify-center">
            <pera-button variant="primary" (click)="backToDashboard()"
              >Back to Dashboard</pera-button
            >
            <pera-button variant="ghost" (click)="contactAdmin()"
              >Contact administrator</pera-button
            >
          </div>
        </div>
      </pera-card>
    </div>
  `,
})
export class ForbiddenComponent {
  private readonly router = inject(Router);

  backToDashboard(): void {
    void this.router.navigate(['/dashboard']);
  }

  contactAdmin(): void {
    window.location.href = 'mailto:admin@atelierpera.example?subject=Access%20request';
  }
}
