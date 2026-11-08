import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import {
  PERA_MODAL_DATA,
  PeraCheckboxComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraRadioComponent,
  PeraSelectComponent,
  PeraTextareaComponent,
  RadioOption,
  SelectOption,
} from '@ds';
import { EmployeeService } from '@modules/people';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { ProjectAccessGrantService } from '../../data/project-access-grant.service';
import {
  ACCESS_AREAS,
  AccessArea,
  GRANT_REASON_MAX,
  ProjectAccessGrant,
} from '../../model/access-grant.model';
import {
  DurationPreset,
  StartChoice,
  localInputToUtc,
  presetEnd,
  utcToLocalInput,
} from '../../model/grant-window';
import { ProjectLevel, levelAtLeast } from '../../model/project-actions';

export interface GrantFormDialogData {
  mode: 'create' | 'edit';
  projectId: string;
  projectName: string;
  /** The project's stages, for "Specific stages". */
  stages: readonly { id: string; name: string }[];
  /** The highest level the caller may grant (`grantLevelCap`). */
  maxLevel: ProjectLevel;
  /** Create: employees who already hold an open grant (edit that one instead). */
  excludeEmployeeIds?: readonly string[];
  /** Edit: the Active or Upcoming grant. */
  grant?: ProjectAccessGrant;
}

const LEVELS: readonly ProjectLevel[] = ['Viewer', 'Editor', 'Manager'];

/**
 * crmp P1-B: "Grant access" / "Edit access" (`POST` / `PUT …/access-grants`, dms
 * ProjectAccessGrantEndpoints.cs:36,46). Create: employee, level, areas, whole project or stages,
 * start (now or a date-time), duration preset (1 day, 1 week, 1 month, a date-time, no end) and the
 * reason. Edit: level, areas, stages, end and reason (the start and the employee are fixed). Dates go
 * out as UTC `Z`. Every refusal shows its catalog message; a concurrent change closes and reloads.
 * Closes with `true` after a save.
 */
@Component({
  selector: 'app-grant-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraCheckboxComponent,
    PeraFormFieldComponent,
    PeraFormModalComponent,
    PeraInputComponent,
    PeraRadioComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="
        isEdit
          ? 'PUT /api/projects/{id}/access-grants/{grantId}'
          : 'POST /api/projects/{id}/access-grants'
      "
      [title]="t(isEdit ? 'gd.titleEdit' : 'gd.titleCreate')"
      [subtitle]="t('gd.subtitle', { project: data.projectName })"
      [submitLabel]="t(isEdit ? 'gd.submitEdit' : 'gd.submitCreate')"
      [submittingLabel]="t('gd.saving')"
      [submitting]="busy()"
      [errorMessage]="serverError()"
      (submitted)="submit()"
      (cancelled)="close(false)"
    >
      <div class="flex flex-col gap-4" data-grant-form>
        @if (!isEdit) {
          <pera-form-field [label]="t('gd.employee')" [required]="true" [error]="shown('employee')">
            <pera-select
              [options]="employeeOptions()"
              [placeholder]="t('gd.pickEmployee')"
              [ngModel]="employeeId()"
              (ngModelChange)="employeeId.set($event)"
              [error]="shown('employee')"
              data-employee
            />
          </pera-form-field>
        }

        <pera-form-field
          [label]="t('gd.level')"
          [required]="true"
          [hint]="data.maxLevel !== 'Manager' ? t('gd.levelCapped') : ''"
        >
          <pera-radio
            [inline]="true"
            [options]="levelOptions"
            [ngModel]="level()"
            (ngModelChange)="level.set($event)"
            data-level
          />
        </pera-form-field>

        <pera-form-field [label]="t('gd.areas')" [required]="true" [error]="shown('areas')">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" data-areas>
            @for (a of areaList; track a) {
              <pera-checkbox
                [ngModel]="areas().includes(a)"
                (ngModelChange)="toggleArea(a, $event)"
                [attr.data-area]="a"
                >{{ t('grants.area.' + a) }}</pera-checkbox
              >
            }
          </div>
        </pera-form-field>

        <pera-form-field [label]="t('gd.scope')" [error]="shown('stages')">
          <pera-radio
            [inline]="true"
            [options]="scopeOptions"
            [ngModel]="scope()"
            (ngModelChange)="scope.set($event)"
            data-scope
          />
          @if (scope() === 'stages') {
            <div class="flex flex-col gap-2 mt-2" data-stages>
              @for (s of data.stages; track s.id) {
                <pera-checkbox
                  [ngModel]="stageIds().includes(s.id)"
                  (ngModelChange)="toggleStage(s.id, $event)"
                  [attr.data-stage]="s.id"
                  >{{ s.name }}</pera-checkbox
                >
              }
            </div>
          }
        </pera-form-field>

        @if (!isEdit) {
          <pera-form-field [label]="t('gd.start')" [error]="shown('start')">
            <pera-radio
              [inline]="true"
              [options]="startOptions"
              [ngModel]="start()"
              (ngModelChange)="start.set($event)"
              data-start
            />
            @if (start() === 'custom') {
              <pera-input
                class="mt-2"
                type="datetime-local"
                [ariaLabel]="t('gd.startAt')"
                [ngModel]="startAt()"
                (ngModelChange)="startAt.set($event ?? '')"
                data-start-at
              />
            }
          </pera-form-field>
        }

        <pera-form-field [label]="t('gd.duration')" [error]="shown('end')">
          <pera-radio
            [inline]="true"
            [options]="durationOptions"
            [ngModel]="duration()"
            (ngModelChange)="duration.set($event)"
            data-duration
          />
          @if (duration() === 'custom') {
            <pera-input
              class="mt-2"
              type="datetime-local"
              [ariaLabel]="t('gd.endAt')"
              [ngModel]="endAt()"
              (ngModelChange)="endAt.set($event ?? '')"
              data-end-at
            />
          }
        </pera-form-field>

        <pera-form-field
          [label]="t('gd.reason')"
          [required]="true"
          [hint]="t('gd.reasonHint', { max: reasonMax })"
          [error]="shown('reason')"
        >
          <pera-textarea
            [rows]="2"
            [ngModel]="reason()"
            (ngModelChange)="reason.set($event ?? '')"
            [error]="shown('reason')"
            data-reason
          />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class GrantFormDialogComponent {
  private readonly api = inject(ProjectAccessGrantService);
  private readonly directory = inject(EmployeeService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly catalog = inject(CatalogService);
  private readonly reloadOnConflict = injectReloadOnConflict();
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as GrantFormDialogData;

  readonly isEdit = this.data.mode === 'edit';
  readonly reasonMax = GRANT_REASON_MAX;
  readonly areaList = ACCESS_AREAS;
  private readonly g = this.data.grant;

  readonly employeeId = signal<string | null>(null);
  readonly level = signal<ProjectLevel>(
    this.g && levelAtLeast(this.data.maxLevel, this.g.level) ? this.g.level : 'Viewer',
  );
  readonly areas = signal<AccessArea[]>(this.g ? [...this.g.areas] : ['Overview']);
  readonly scope = signal<'whole' | 'stages'>(this.g?.stageIds.length ? 'stages' : 'whole');
  readonly stageIds = signal<string[]>(this.g ? [...this.g.stageIds] : []);
  readonly start = signal<StartChoice>('now');
  readonly startAt = signal('');
  readonly duration = signal<DurationPreset>(
    this.g ? (this.g.expiresAtUtc ? 'custom' : 'none') : 'week',
  );
  readonly endAt = signal(utcToLocalInput(this.g?.expiresAtUtc));
  readonly reason = signal(this.g?.reason ?? '');

  readonly busy = signal(false);
  readonly tried = signal(false);
  readonly serverError = signal<string | null>(null);
  readonly employeeOptions = signal<SelectOption[]>([]);

  readonly levelOptions: RadioOption[] = LEVELS.map((l) => ({
    value: l,
    label: this.t(`grants.level.${l}`),
    disabled: !levelAtLeast(this.data.maxLevel, l),
  }));
  readonly scopeOptions: RadioOption[] = [
    { value: 'whole', label: this.t('gd.scope.whole') },
    { value: 'stages', label: this.t('gd.scope.stages'), disabled: !this.data.stages.length },
  ];
  readonly startOptions: RadioOption[] = [
    { value: 'now', label: this.t('gd.start.now') },
    { value: 'custom', label: this.t('gd.start.custom') },
  ];
  readonly durationOptions: RadioOption[] = (
    ['day', 'week', 'month', 'custom', 'none'] as const
  ).map((d) => ({ value: d, label: this.t(`gd.duration.${d}`) }));

  /** Field → message, while the form is invalid (shown after the first submit). */
  readonly invalid = computed<Partial<Record<string, string>>>(() => {
    const e: Record<string, string> = {};
    if (!this.isEdit && !this.employeeId()) e['employee'] = this.t('gd.err.employee');
    if (!this.areas().length) e['areas'] = this.t('gd.err.areas');
    if (this.scope() === 'stages' && !this.stageIds().length) e['stages'] = this.t('gd.err.stages');
    if (!this.isEdit && this.start() === 'custom' && !localInputToUtc(this.startAt()))
      e['start'] = this.t('gd.err.start');
    const w = this.window();
    if (w && w.end && (w.end <= w.base || w.end <= Date.now())) e['end'] = this.t('gd.err.end');
    if (w === null) e['end'] = this.t('gd.err.end');
    const r = this.reason().trim();
    if (!r || r.length > GRANT_REASON_MAX)
      e['reason'] = this.t('gd.err.reason', { max: GRANT_REASON_MAX });
    return e;
  });

  constructor() {
    if (!this.isEdit) {
      const skip = new Set(this.data.excludeEmployeeIds ?? []);
      this.directory
        .listPaged({ page: 1, pageSize: 500, isActive: true })
        .pipe(catchError(() => of(null)))
        .subscribe((paged) =>
          this.employeeOptions.set(
            (paged?.items ?? [])
              .filter((e) => !skip.has(e.id))
              .map((e) => ({ value: e.id, label: e.fullName })),
          ),
        );
    }
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.catalog.t(key as CatalogKey, params);
  }

  shown(field: string): string | undefined {
    return this.tried() ? this.invalid()[field] : undefined;
  }

  toggleArea(area: AccessArea, on: boolean): void {
    this.areas.update((list) =>
      on
        ? ACCESS_AREAS.filter((a) => a === area || list.includes(a))
        : list.filter((a) => a !== area),
    );
  }

  toggleStage(id: string, on: boolean): void {
    this.stageIds.update((list) =>
      on ? [...new Set([...list, id])] : list.filter((x) => x !== id),
    );
  }

  /**
   * The start the presets run from (ms) and the end (ms, null for "No end"); `null` when the custom
   * end is missing or unreadable.
   */
  private window(): { base: number; end: number | null } | null {
    const now = Date.now();
    let base = now;
    if (this.isEdit) {
      const s = this.g ? Date.parse(this.g.startsAtUtc) : NaN;
      base = Number.isNaN(s) ? now : Math.max(now, s);
    } else if (this.start() === 'custom') {
      const s = localInputToUtc(this.startAt());
      base = s ? Date.parse(s) : now;
    }
    const preset = this.duration();
    if (preset === 'none') return { base, end: null };
    if (preset === 'custom') {
      const e = localInputToUtc(this.endAt());
      return e ? { base, end: Date.parse(e) } : null;
    }
    return { base, end: presetEnd(preset, new Date(base))!.getTime() };
  }

  submit(): void {
    if (this.busy()) return;
    this.tried.set(true);
    if (Object.keys(this.invalid()).length) return;
    const w = this.window()!;
    const common = {
      level: this.level(),
      areas: this.areas(),
      stageIds: this.scope() === 'stages' ? this.stageIds() : [],
      expiresAtUtc: w.end === null ? null : new Date(w.end).toISOString(),
      reason: this.reason().trim(),
    };
    const call = this.isEdit
      ? this.api.update(this.data.projectId, this.g!.id, common)
      : this.api.create(this.data.projectId, {
          ...common,
          employeeId: this.employeeId()!,
          startsAtUtc: this.start() === 'custom' ? localInputToUtc(this.startAt()) : null,
        });
    this.busy.set(true);
    this.serverError.set(null);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.close(true);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        if (this.reloadOnConflict(err, () => this.close(true))) return;
        this.serverError.set(friendly(this.errors.parse(err)));
      },
    });
  }

  close(saved: boolean): void {
    this.modalRef.close(saved);
  }
}
