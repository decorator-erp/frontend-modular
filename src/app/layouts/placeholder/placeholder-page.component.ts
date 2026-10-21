import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Minimal stand-in for a route body not yet ported. No `SOURCE_SHA` counterpart —
 * introduced at spec 004 for `intake`/`intake/:lang`, which sit outside both shells
 * (anonymous lead intake) and so cannot be left as a commented-out stub the way
 * every shell-child route is: `/intake` is linked from `login.component.html` and
 * must resolve to *something* before spec 009 ports the real `IntakePageComponent`.
 *
 * No `label` input: `app.config.ts`'s `withComponentInputBinding()` defaults to
 * `unmatchedInputBehavior: 'alwaysUndefined'`, which force-sets every declared input
 * of a routed component to `undefined` unless a route param/data/queryParam supplies
 * it — silently discarding a signal input's default value. No route here passes one,
 * so the text is static instead of parameterized.
 *
 * TODO(009): delete once IntakePageComponent lands and app.routes.ts points there.
 */
@Component({
  selector: 'app-placeholder-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center justify-center min-h-screen p-6 text-center">
      <p class="text-text-secondary">This page is not available yet.</p>
    </div>
  `,
})
export class PlaceholderPageComponent {}
