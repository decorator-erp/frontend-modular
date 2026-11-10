import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { ClientProfileStore } from '../../stores/client-profile.store';
import { CatalogService } from '@platform/i18n/catalog.service';
import {
  PeraAlertComponent,
  PeraCardComponent,
  PeraEmptyComponent,
  PeraSpinnerComponent,
} from '@ds';
import { CrmClientSchedulerComponent } from './client-scheduler.component';

/**
 * The `/portal/schedule` nav destination (T104's "request a meeting" tab) — resolves
 * WHICH project to schedule against before delegating to `CrmClientSchedulerComponent`
 * (T052, built in B2 but never wired to a route until now).
 *
 * Resolution order: a `?projectId=` query param (set by the profile screen's
 * per-project quick action) — falling back to the caller's only project when there is
 * exactly one, or a picker when there are several. All three paths share one
 * `ClientProfileStore` load, which also carries `openPeriodId`.
 */
@Component({
  selector: 'app-crm-client-schedule-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ClientProfileStore],
  imports: [
    PeraAlertComponent,
    PeraCardComponent,
    PeraEmptyComponent,
    PeraSpinnerComponent,
    CrmClientSchedulerComponent,
  ],
  host: { class: 'block' },
  template: `
    @if (profile.loading() && !profile.loaded()) {
      <div class="flex justify-center py-8"><pera-spinner /></div>
    } @else if (profile.error()) {
      <pera-alert tone="warning">{{ catalog.t(profile.error()!) }}</pera-alert>
    } @else if (!profile.projects().length) {
      <pera-card><pera-empty [title]="catalog.t('client.myProjects')" /></pera-card>
    } @else if (resolvedProjectId(); as projectId) {
      <app-crm-client-scheduler [projectId]="projectId" [periodId]="resolvedPeriodId()" />
    } @else {
      <pera-card>
        <div class="flex flex-col gap-2 p-1">
          @for (p of profile.projects(); track p.id) {
            <button
              type="button"
              (click)="pickedProjectId.set(p.id)"
              class="text-start p-3 border border-border bg-surface rounded-card cursor-pointer fs-body-sm
                     outline-none focus-visible:outline-2 focus-visible:outline-accent"
            >
              {{ p.name }}
            </button>
          }
        </div>
      </pera-card>
    }
  `,
})
export class CrmClientSchedulePageComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly catalog = inject(CatalogService);
  protected readonly profile = inject(ClientProfileStore);

  private readonly queryProjectId = toSignal(
    this.route.queryParamMap.pipe(map((q) => q.get('projectId'))),
    { initialValue: null },
  );
  protected readonly pickedProjectId = signal<string | null>(null);

  protected readonly resolvedProjectId = computed(() => {
    const fromQuery = this.queryProjectId();
    if (fromQuery) return fromQuery;
    if (this.pickedProjectId()) return this.pickedProjectId();
    const projects = this.profile.projects();
    return projects.length === 1 ? projects[0].id : null;
  });

  protected readonly resolvedPeriodId = computed(
    () =>
      this.profile.projects().find((p) => p.id === this.resolvedProjectId())?.openPeriodId ?? null,
  );

  constructor() {
    effect(() => {
      this.profile.load();
    });
  }
}
