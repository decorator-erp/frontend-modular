import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import {
  PeraAlertComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraChipComponent,
  PeraEmptyComponent,
  PeraFormFieldComponent,
  PeraSelectComponent,
  PeraSkeletonComponent,
  type SelectOption,
} from '@ds';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { SiteDefinitionService } from '../../data/site-definition.service';
import { SiteService } from '../../data/site.service';
import type { SiteSchemaField } from '../../model/site-definition.model';
import { formatCell } from '../../model/site-format';
import { localName } from '../../model/site-normalize';
import type { SiteFamilies, SiteFamily, SitePivot } from '../../model/site.model';
import { SiteDetailStore } from '../../stores/site-detail.store';

export type FamilyMode = 'exact' | 'size' | 'custom';

/** The `groupBy` query a mode sends (R16): Exact sends nothing, Size `size`, Custom the codes joined by `,`. */
export function familyGroupBy(mode: FamilyMode, codes: readonly string[]): string | null {
  if (mode === 'size') return 'size';
  if (mode === 'custom') return codes.join(',');
  return null;
}

/**
 * sites S-7: Families (prototype `familiesTab`, `sites.js:632-664`): module select (modules with
 * records), pills Exact / Size / Custom, and for Custom the field pills of the module's schema (D2,
 * hidden fields included). R16 answers `{groupBy, families}`; `familyKey` is the track key only, never
 * parsed (`RecordContracts.cs:74-84`). The per-dimension columns show the first member's value read
 * from the module's pivot (DEVIATION-26). 400 `sites.families.NoDimensions` / `UnknownGroupBy` show
 * inline with the code (`handled(400)` on R16), never as a toast.
 */
@Component({
  selector: 'app-site-families',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraChipComponent,
    PeraEmptyComponent,
    PeraFormFieldComponent,
    PeraSelectComponent,
    PeraSkeletonComponent,
  ],
  template: `
    @if (modules().length === 0) {
      <pera-empty [title]="t('sv.noRecords')" iconName="inbox" data-families-empty />
    } @else {
      <div class="flex flex-col gap-4">
        <div class="flex items-end justify-between gap-4 flex-wrap">
          <div class="flex items-end gap-3 flex-wrap">
            <pera-form-field [label]="t('sv.famModule')" class="min-w-56">
              <pera-select
                [options]="moduleOptions()"
                [ngModel]="moduleId()"
                (ngModelChange)="pickModule($event)"
                data-family-module
              />
            </pera-form-field>
            <div
              class="flex items-center gap-2 flex-wrap pb-1"
              role="group"
              [attr.aria-label]="t('sv.famGroupBy')"
              data-family-modes
            >
              @for (m of modes; track m) {
                <pera-chip [on]="mode() === m" (toggled)="setMode(m)" [attr.data-mode]="m">{{
                  t(modeKey(m))
                }}</pera-chip>
              }
            </div>
          </div>
          <span class="fs-label text-text-muted" dir="ltr" data-group-by
            >groupBy={{ groupByLabel() }}</span
          >
        </div>

        @if (mode() === 'custom') {
          <div
            class="flex items-center gap-2 flex-wrap"
            role="group"
            [attr.aria-label]="t('sv.famFields')"
            data-family-fields
          >
            @for (f of fields(); track f.itemId) {
              <pera-chip
                [on]="custom().includes(f.code)"
                (toggled)="toggleField(f.code)"
                [attr.data-field]="f.code"
                >{{ name(f) }}</pera-chip
              >
            }
          </div>
        }

        @if (problem(); as p) {
          <pera-alert tone="danger" data-family-error>
            {{ p.message }} <span class="fs-label" dir="ltr">400 · {{ p.code }}</span>
          </pera-alert>
        } @else if (error(); as message) {
          <pera-alert tone="danger" data-family-load-error>
            {{ message }}
            <pera-button variant="secondary" size="sm" (click)="load()">{{
              t('sv.retry')
            }}</pera-button>
          </pera-alert>
        } @else if (!result()) {
          <div class="flex flex-col gap-2" aria-busy="true">
            <pera-skeleton [height]="32" />
            <pera-skeleton [height]="32" />
          </div>
        } @else if (result(); as r) {
          <pera-card padding="none">
            <div class="p-4 border-b border-border">
              <h2 class="m-0 fs-body font-semibold">
                {{ t('sv.familiesT', { n: r.families.length }) }}
              </h2>
              <p class="m-0 mt-1 fs-label text-text-secondary">{{ t('sv.familiesSub') }}</p>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full fs-body-sm border-collapse" data-families>
                <thead>
                  <tr class="fs-micro uppercase text-text-muted border-b border-border">
                    @for (code of r.groupBy; track code) {
                      <th class="text-start p-2" [attr.data-col]="code">{{ header(code) }}</th>
                    }
                    <th class="text-end p-2">{{ t('sv.instances') }}</th>
                    <th class="text-end p-2">{{ t('sv.spacesCount') }}</th>
                    <th class="text-start p-2">{{ t('sv.members') }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (f of r.families; track f.familyKey) {
                    <tr class="border-b border-border" data-family>
                      @for (code of r.groupBy; track code) {
                        <td class="p-2" [attr.data-cell]="code">{{ value(f, code) }}</td>
                      }
                      <td class="p-2 text-end font-semibold" data-instances>
                        {{ num(f.instances) }}
                      </td>
                      <td class="p-2 text-end">{{ num(f.spaceCount) }}</td>
                      <td class="p-2 fs-label" dir="auto">{{ f.members.join(', ') }}</td>
                    </tr>
                  } @empty {
                    <tr>
                      <td [attr.colspan]="r.groupBy.length + 3" class="p-4">
                        <pera-empty [title]="t('sv.noRecords')" />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </pera-card>
        }
      </div>
    }
  `,
})
export class SiteFamiliesComponent {
  private readonly api = inject(SiteService);
  private readonly defs = inject(SiteDefinitionService);
  private readonly detail = inject(SiteDetailStore);
  private readonly catalog = inject(CatalogService);
  private readonly errors = inject(ErrorHandlerService);

  protected readonly modes: readonly FamilyMode[] = ['exact', 'size', 'custom'];

  /** Active modules that hold records on this survey. */
  protected readonly modules = computed(() => {
    const counts = new Map(
      (this.detail.site()?.recordCounts ?? []).map((c) => [c.moduleId, c.recordCount]),
    );
    return this.detail.modules().filter((m) => (counts.get(m.id) ?? 0) > 0);
  });
  private readonly picked = signal<string | null>(null);
  protected readonly moduleId = computed(() => {
    const mods = this.modules();
    return mods.find((m) => m.id === this.picked())?.id ?? mods[0]?.id ?? null;
  });
  protected readonly mode = signal<FamilyMode>('exact');
  protected readonly custom = signal<string[]>([]);

  protected readonly fields = signal<SiteSchemaField[]>([]);
  private readonly pivot = signal<SitePivot | null>(null);
  protected readonly result = signal<SiteFamilies | null>(null);
  protected readonly problem = signal<{ code: string; message: string } | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly moduleOptions = computed<SelectOption[]>(() => {
    const locale = this.catalog.locale();
    return this.modules().map((m) => ({ value: m.id, label: localName(m, locale) }));
  });

  protected readonly groupByLabel = computed(() => {
    const g = familyGroupBy(this.mode(), this.custom());
    return g === null ? 'exact' : g || '…';
  });

  private generation = 0;

  constructor() {
    // A module change re-reads its schema and pivot.
    effect(() => {
      const siteId = this.detail.site()?.id;
      const moduleId = this.moduleId();
      if (!siteId || !moduleId) return;
      untracked(() => this.loadModule(siteId, moduleId));
    });
    // Any change of module, mode or picked fields re-reads the families.
    effect(() => {
      this.moduleId();
      this.mode();
      this.custom();
      untracked(() => this.load());
    });
  }

  protected t(key: CatalogKey, params?: Record<string, string | number>): string {
    return this.catalog.t(key, params);
  }

  protected modeKey(m: FamilyMode): CatalogKey {
    return `sv.fam.${m}` as CatalogKey;
  }

  protected name(f: { nameEn: string; nameAr: string }): string {
    return localName(f, this.catalog.locale());
  }

  protected num(n: number): string {
    return new Intl.NumberFormat(this.catalog.locale() === 'ar' ? 'ar-EG' : 'en-GB').format(n);
  }

  protected pickModule(id: unknown): void {
    if (typeof id !== 'string' || id === this.moduleId()) return;
    this.custom.set([]);
    this.picked.set(id);
  }

  protected setMode(m: FamilyMode): void {
    this.mode.set(m);
  }

  protected toggleField(code: string): void {
    this.custom.update((list) =>
      list.includes(code) ? list.filter((c) => c !== code) : [...list, code],
    );
  }

  protected header(code: string): string {
    const f = this.fields().find((x) => x.code === code);
    return f ? (f.unit ? `${this.name(f)} (${f.unit})` : this.name(f)) : code;
  }

  /** The value of `code` on the family's first member (DEVIATION-26: the key itself is opaque). */
  protected value(f: SiteFamily, code: string): string {
    const pivot = this.pivot();
    const field =
      pivot?.columns.find((c) => c.code === code) ?? this.fields().find((c) => c.code === code);
    const row = pivot?.rows.find((r) => r.label === f.members[0]);
    if (!field || !row) return '—';
    return formatCell(field, row.cells[code], this.catalog.locale(), (v) =>
      this.t(v ? 'sv.yes' : 'sv.no'),
    );
  }

  private loadModule(siteId: string, moduleId: string): void {
    const module = this.modules().find((m) => m.id === moduleId);
    this.fields.set([]);
    this.pivot.set(null);
    if (module) {
      this.defs
        .schema(module.code)
        .pipe(catchError(() => of(null)))
        .subscribe((s) =>
          this.fields.set((s?.fields ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder)),
        );
    }
    this.api
      .pivot(siteId, moduleId)
      .pipe(catchError(() => of(null)))
      .subscribe((p) => this.pivot.set(p));
  }

  load(): void {
    const siteId = this.detail.site()?.id;
    const moduleId = this.moduleId();
    if (!siteId || !moduleId) return;
    const gen = ++this.generation;
    this.result.set(null);
    this.error.set(null);
    this.problem.set(null);
    // DEVIATION-25: the server reads an EMPTY groupBy as Exact (SiteRecordQueryHandlers.cs:286), so
    // Custom with no field picked is refused here with the server's own code instead of sent.
    if (this.mode() === 'custom' && this.custom().length === 0) {
      this.problem.set({
        code: 'sites.families.UnknownGroupBy',
        message: this.t('sv.err.noGroupBy'),
      });
      return;
    }
    this.api.families(siteId, moduleId, familyGroupBy(this.mode(), this.custom())).subscribe({
      next: (r) => {
        if (gen === this.generation) this.result.set(r);
      },
      error: (err: unknown) => {
        if (gen !== this.generation) return;
        if (err instanceof HttpErrorResponse && err.status === 400) {
          const parsed = this.errors.parse(err);
          const code = parsed.code ?? 'Validation.General';
          const message =
            code === 'sites.families.NoDimensions' ? this.t('sv.err.noDims') : friendly(parsed);
          this.problem.set({ code, message });
          return;
        }
        this.error.set(
          err instanceof HttpErrorResponse ? friendly(this.errors.parse(err)) : String(err),
        );
      },
    });
  }
}
