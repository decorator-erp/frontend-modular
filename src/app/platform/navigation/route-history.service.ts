import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * Records the last few visited in-app routes so the 404 page can offer
 * "Recent screens". Inject once from the app shell to start recording.
 */
@Injectable({ providedIn: 'root' })
export class RouteHistoryService {
  private readonly router = inject(Router);
  readonly recent = signal<string[]>([]);

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const url = e.urlAfterRedirects;
        if (url.startsWith('/login') || url === '/') return;
        this.recent.update((list) => [url, ...list.filter((u) => u !== url)].slice(0, 5));
      });
  }
}
