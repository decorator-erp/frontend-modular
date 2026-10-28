import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { StageTemplatesService } from '@modules/library';
import { EmployeeService } from '@modules/people';
import { ConfirmService } from '@ds';
import { ERROR_MESSAGES_AR } from '@platform/errors/error-catalog';
import { AR } from '@platform/i18n/catalog/ar';
import { EN } from '@platform/i18n/catalog/en';
import { LocaleService } from '@platform/i18n/locale.service';
import { PermissionsService, PERM } from '@platform/permissions';
import { ProjectService } from '../../data/project.service';
import { ScopeOfWorkService } from '../../data/scope-of-work.service';
import { ScopeOfWork, ScopeOfWorkItem, ScopeOfWorkStatus } from '../../model/scope-of-work.model';
import { ScopeOfWorkPageComponent } from './scope-of-work-page.component';

function item(over: Partial<ScopeOfWorkItem> = {}): ScopeOfWorkItem {
  return {
    id: 'i1',
    sourceStageId: 's1',
    sourceTemplateName: 'Residential',
    name: 'Concept design',
    description: null,
    order: 1,
    fee: 25000,
    createdStageId: null,
    sourceMissing: true,
    ...over,
  };
}

function scope(over: Partial<ScopeOfWork> = {}): ScopeOfWork {
  return {
    id: 'sow1',
    projectId: 'p1',
    status: ScopeOfWorkStatus.Draft,
    durationDays: 120,
    plannedStartDate: null,
    estimatedEndDate: null,
    subtotal: 25000,
    adjustmentAmount: -500,
    adjustmentNote: 'Discount',
    total: 24500,
    notes: null,
    confirmedAtUtc: null,
    confirmedById: null,
    items: [item(), item({ id: 'i2', sourceStageId: 's2', order: 2, sourceMissing: false })],
    canConfirm: false,
    blockingReason: 'projects.scope.SourceStageNotFound',
    ...over,
  };
}

const sowKeys = (dict: object) => Object.keys(dict).filter((k) => k.startsWith('sow.'));

/**
 * Physical (direction-bound) Tailwind utilities. The page must use logical ones (`ms-`/`me-`,
 * `ps-`/`pe-`, `start-`/`end-`, `text-start`/`text-end`) so the platform's `dir` switch mirrors it.
 */
const PHYSICAL =
  /^-?(m[lr]|p[lr]|left|right|inset-[lr]|border-[lr]|rounded-[lr]|rounded-[tb][lr]|text-left|text-right|float-left|float-right|scroll-m[lr]|scroll-p[lr])(-|$)/;

/** Classes on elements the scope-of-work templates own: not inside a design-system component. */
function ownClasses(root: HTMLElement): string[] {
  const out: string[] = [];
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    if (insideDs(node, root)) continue;
    for (const c of Array.from(node.classList)) out.push(c.split(':').pop()!);
  }
  return out;
}

function insideDs(node: HTMLElement, root: HTMLElement): boolean {
  for (let p = node.parentElement; p && p !== root; p = p.parentElement) {
    if (p.tagName.startsWith('PERA-')) return true;
  }
  return false;
}

/** sow #9: i18n EN/AR and RTL (B16). */
describe('Scope of work — i18n and direction (sow #9)', () => {
  let fixture: ComponentFixture<ScopeOfWorkPageComponent>;
  let el: HTMLElement;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = {
      getScope: vi.fn().mockReturnValue(of(scope())),
    };
    TestBed.configureTestingModule({
      imports: [ScopeOfWorkPageComponent],
      providers: [
        provideRouter([]),
        { provide: ScopeOfWorkService, useValue: api },
        {
          provide: ProjectService,
          useValue: {
            getById: vi
              .fn()
              .mockReturnValue(of({ id: 'p1', name: 'Villa', workflowType: 'Stage' })),
          },
        },
        {
          provide: PermissionsService,
          useValue: {
            can: (p: string) =>
              [PERM.scope.read, PERM.scope.manage, PERM.scope.confirm].includes(p as never),
          },
        },
        {
          provide: StageTemplatesService,
          useValue: { list: vi.fn().mockReturnValue(of([])), stages: vi.fn() },
        },
        {
          provide: EmployeeService,
          useValue: { getById: vi.fn().mockReturnValue(of({ fullName: 'منى عادل' })) },
        },
        { provide: ConfirmService, useValue: { open: vi.fn() } },
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(LocaleService).locale.set('en');
    TestBed.tick();
    try {
      localStorage.removeItem('pera-locale');
    } catch {
      /* storage unavailable */
    }
    document.documentElement.setAttribute('dir', 'ltr');
    document.documentElement.setAttribute('lang', 'en');
  });

  function render(locale: 'en' | 'ar' = 'en') {
    TestBed.inject(LocaleService).locale.set(locale);
    fixture = TestBed.createComponent(ScopeOfWorkPageComponent);
    fixture.componentRef.setInput('id', 'p1');
    fixture.detectChanges();
    TestBed.tick();
    el = fixture.nativeElement;
  }

  it('every sow.* key has EN and AR copy', () => {
    const en = sowKeys(EN);
    expect(en.length).toBeGreaterThan(50);
    const ar = AR as Record<string, string | undefined>;
    const missing = en.filter((k) => !ar[k]?.trim());
    expect(missing).toEqual([]);
    // No AR-only orphan either.
    expect(sowKeys(AR).filter((k) => !(k in EN))).toEqual([]);
  });

  it('the codes the page shows (blockingReason, B12, B14) have an AR message', () => {
    for (const code of [
      'projects.NotFound',
      'projects.AccessDenied',
      'projects.scope.ConcurrentUpdate',
      'projects.scope.WorkflowNotSupported',
      'projects.scope.Empty',
      'projects.scope.DurationRequired',
      'projects.scope.AdjustmentNoteRequired',
      'projects.scope.NegativeTotal',
      'projects.scope.ProjectHasStages',
      'projects.scope.SourceStageNotFound',
      'teams.MissingHead',
    ]) {
      expect(ERROR_MESSAGES_AR[code], code).toBeTruthy();
    }
  });

  it('under ar the page is rtl and reads the AR catalog, codes included (B16)', () => {
    render('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    const text = el.textContent!;
    for (const key of [
      'sow.title',
      'sow.items',
      'sow.statusDraft',
      'sow.duration',
      'sow.fees',
      'sow.total',
      'sow.confirmScope',
      'sow.sourceMissing',
      'sow.adjustmentNote',
    ] as const) {
      expect(text, key).toContain(AR[key]!);
    }
    expect(el.querySelector('[data-blocking-reason]')!.textContent!.trim()).toBe(
      ERROR_MESSAGES_AR['projects.scope.SourceStageNotFound'],
    );
    expect(text).not.toContain(EN['sow.confirmScope']);
    expect(text).not.toContain(EN['sow.items']);
  });

  it('the confirmed banner reads Arabic under ar (B11, B16)', () => {
    api['getScope'].mockReturnValue(
      of(
        scope({
          status: ScopeOfWorkStatus.Confirmed,
          confirmedAtUtc: '2026-10-27T09:30:00Z',
          confirmedById: 'e1',
          canConfirm: false,
          blockingReason: 'projects.scope.Confirmed',
        }),
      ),
    );
    render('ar');
    const banner = el.querySelector('[data-confirmed-banner]')!.textContent!;
    expect(banner).toContain('منى عادل');
    expect(banner).toContain('أُكِّد في');
    expect(el.textContent).toContain(AR['sow.readOnlyFooter']!);
  });

  it('no physical ml-/mr-/pl-/pr-/left-/right- utility in the templates (B16)', () => {
    // Draft with the picker open, then Confirmed: between them every template branch renders.
    render();
    const toggle = Array.from(el.querySelectorAll<HTMLButtonElement>('pera-button button')).find(
      (b) => b.textContent!.trim() === EN['sow.addFromTemplates'],
    )!;
    toggle.click();
    fixture.detectChanges();
    const draft = ownClasses(el);
    api['getScope'].mockReturnValue(
      of(scope({ status: ScopeOfWorkStatus.Confirmed, confirmedById: 'e1' })),
    );
    fixture.destroy();
    render();
    const confirmed = ownClasses(el);
    const all = [...draft, ...confirmed];
    expect(all.length).toBeGreaterThan(50);
    expect(all.filter((c) => PHYSICAL.test(c))).toEqual([]);
    // The logical forms are what the templates use.
    expect(all.some((c) => c === 'text-end' || c === 'text-start')).toBe(true);
  });

  it('the matcher itself catches physical utilities', () => {
    for (const c of [
      'ml-2',
      'mr-auto',
      'pl-3',
      'pr-0',
      'left-0',
      'right-2',
      'text-left',
      '-ml-1',
    ]) {
      expect(PHYSICAL.test(c), c).toBe(true);
    }
    for (const c of ['ms-2', 'me-auto', 'ps-3', 'pe-0', 'start-0', 'end-2', 'text-end', 'mt-1']) {
      expect(PHYSICAL.test(c), c).toBe(false);
    }
  });
});
