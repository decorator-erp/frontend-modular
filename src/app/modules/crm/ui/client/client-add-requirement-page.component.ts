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
import { CrmAddRequirementComponent } from './add-requirement.component';

/**
 * The `/portal/add-requirement` nav destination — same project-resolution shape as
 * `CrmClientSchedulePageComponent`, delegating to `CrmAddRequirementComponent` (T087,
 * built in B4 but never wired to a route until now). `periodId` doubles as the
 * closed-period edge case (T088): a resolved project with `openPeriodId: null` still
 * renders the form, which then shows the "period closed" alert itself.
 */
@Component({
  selector: 'app-crm-client-add-requirement-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ClientProfileStore],
  imports: [
    PeraAlertComponent,
    PeraCardComponent,
    PeraEmptyComponent,
    PeraSpinnerComponent,
    CrmAddRequirementComponent,
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
      <app-crm-add-requirement [projectId]="projectId" [periodId]="resolvedPeriodId()" />
    } @else {
      <pera-card>
        <div class="flex flex-col gap-2 p-1">
          @for (p of profile.projects(); track p.id) {
            <button
              type="button"
              (click)="pickedProjectId.set(p.id)"
              class="text-start p-3 border border-border bg-surface cursor-pointer fs-body-sm
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
export class CrmClientAddRequirementPageComponent {
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
