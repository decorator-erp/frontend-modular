import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { EN } from '@platform/i18n/catalog/en';
import { AR } from '@platform/i18n/catalog/ar';
import { PERM } from '@platform/permissions';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { environment } from '../../../../../environments/environment';
import { CrmBriefService } from '../../data/crm-brief.service';
import type { BriefHeadDiff } from '../../model';
import { CrmApprovalsInboxComponent } from './approvals-inbox.component';

const BASE = `${environment.apiUrl}/crm/portal/approvals`;

function wire(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    subjectType: 2,
    subjectId: 'B',
    projectId: 'P',
    projectName: 'Villa',
    briefId: 'B',
    stageId: 'S',
    stageName: 'Gathering',
    round: 1,
    title: null,
    requestedAtUtc: '2026-07-01T00:00:00Z',
    dueAtUtc: null,
    decision: null,
    decidedAtUtc: null,
    comment: null,
    ...extra,
  };
}

const page = (items: Record<string, unknown>[]) => ({
  items,
  pageNumber: 1,
  pageSize: 20,
  totalCount: items.length,
  totalPages: items.length ? 1 : 0,
});

// crm-prod B1-fe: the client approvals inbox (replaces 009b #N-2's "not available").
describe('CrmApprovalsInboxComponent (crm-prod B1-fe)', () => {
  let http: HttpTestingController;
  let perms: ReturnType<typeof signal<string[]>>;
  let getHeadDiff: ReturnType<typeof vi.fn>;
  let getMyBrief: ReturnType<typeof vi.fn>;
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    perms = signal<string[]>([PERM.crm.approvals.viewOwn, PERM.crm.approvals.decideOwn]);
    getHeadDiff = vi.fn();
    getMyBrief = vi.fn();
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      imports: [CrmApprovalsInboxComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CrmBriefService, useValue: { getHeadDiff, getMyBrief } },
        { provide: ToastService, useValue: toast },
        {
          provide: PermissionsService,
          useValue: {
            can: (p: string | string[]) =>
              (Array.isArray(p) ? p : [p]).every((x) => perms().includes(x)),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const list = (status: 'pending' | 'decided'): TestRequest =>
    http.expectOne((r) => r.url === BASE && r.params.get('status') === status);

  function render(
    pending: Record<string, unknown>[] = [wire('A1')],
    decided: Record<string, unknown>[] = [],
  ): ComponentFixture<CrmApprovalsInboxComponent> {
    const fixture = TestBed.createComponent(CrmApprovalsInboxComponent);
    fixture.detectChanges();
    list('pending').flush(page(pending));
    list('decided').flush(page(decided));
    fixture.detectChanges();
    return fixture;
  }

  const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
  const btn = (f: ComponentFixture<unknown>, testId: string) =>
    el(f).querySelector(`[data-testid="${testId}"] button`) as HTMLButtonElement | null;

  it('shows a loading skeleton before the lists land', () => {
    const fixture = TestBed.createComponent(CrmApprovalsInboxComponent);
    fixture.detectChanges();
    expect(el(fixture).querySelector('[data-testid="pending-skeleton"]')).not.toBeNull();
    list('pending').flush(page([]));
    list('decided').flush(page([]));
  });

  it('labels a brief round with its project, stage and a link to the brief', () => {
    const fixture = render();
    const text = el(fixture).textContent ?? '';
    expect(text).toContain('Brief round 1');
    expect(text).toContain('Villa');
    expect(text).toContain('Gathering');
    const link = el(fixture).querySelector('a') as HTMLAnchorElement;
    expect(link.textContent).toContain('View the brief');
    expect(link.getAttribute('href')).toBe('/portal?projectId=P&tab=brief');
  });

  it('labels an entry with its space name and an item with its title', () => {
    const fixture = render([
      wire('E1', { subjectType: 4, subjectId: 'E', title: 'Kitchen', round: 2 }),
      wire('I1', { subjectType: 3, subjectId: 'I', briefId: null, title: 'Island' }),
    ]);
    const text = el(fixture).textContent ?? '';
    expect(text).toContain('Gathering entry · Kitchen');
    expect(text).toContain('round 2');
    expect(text).toContain('Requirement item · Island');
    const links = Array.from(el(fixture).querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/portal?projectId=P&tab=brief',
      '/portal?projectId=P',
    ]);
  });

  it('shows the empty states', () => {
    const text = el(render([], [])).textContent ?? '';
    expect(text).toContain('Nothing is waiting for your decision.');
    expect(text).toContain('No decisions yet.');
  });

  it('shows the error state with a Retry that re-reads the list', () => {
    const fixture = TestBed.createComponent(CrmApprovalsInboxComponent);
    fixture.detectChanges();
    list('pending').flush(null, { status: 500, statusText: 'Server Error' });
    list('decided').flush(page([]));
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('Could not load your approvals.');
    (
      el(fixture).querySelector('[data-testid="pending-error"] button') as HTMLButtonElement
    ).click();
    list('pending').flush(page([wire('A1')]));
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('Brief round 1');
  });

  it('FINDING-P2-6: the pending heading shows the server totalCount, not the rows loaded', () => {
    const fixture = TestBed.createComponent(CrmApprovalsInboxComponent);
    fixture.detectChanges();
    list('pending').flush({ ...page([wire('A1'), wire('A2')]), totalCount: 45, totalPages: 3 });
    list('decided').flush(page([]));
    fixture.detectChanges();
    const heading = el(fixture).querySelector('#appr-pending-h')?.textContent ?? '';
    expect(heading.replace(/\s+/g, ' ')).toContain('(45)');
  });

  it('Approve sends decision 1 and re-reads both lists', () => {
    const fixture = render();
    btn(fixture, 'approve')!.click();
    const req = http.expectOne(`${BASE}/A1/decide`);
    expect(req.request.body).toEqual({ decision: 1, comment: null });
    req.flush(null, { status: 204, statusText: 'No Content' });
    list('pending').flush(page([]));
    list('decided').flush(
      page([wire('A1', { decision: 1, decidedAtUtc: '2026-07-02T00:00:00Z' })]),
    );
    fixture.detectChanges();
    const text = el(fixture).textContent ?? '';
    expect(text).toContain('Nothing is waiting for your decision.');
    expect(text).toContain('Approved');
  });

  it('a double click on Approve sends one request, the buttons disabled while in flight', () => {
    const fixture = render();
    const approve = btn(fixture, 'approve')!;
    approve.click();
    fixture.detectChanges();
    approve.click();
    expect(btn(fixture, 'approve')!.disabled).toBe(true);
    expect(btn(fixture, 'request-changes')!.disabled).toBe(true);
    http.expectOne(`${BASE}/A1/decide`).flush(null, { status: 204, statusText: 'No Content' });
    list('pending').flush(page([]));
    list('decided').flush(page([]));
  });

  it('Request changes needs a comment: inline error, submit disabled until non-blank', () => {
    const fixture = render();
    btn(fixture, 'request-changes')!.click();
    fixture.detectChanges();

    const textarea = el(fixture).querySelector('textarea') as HTMLTextAreaElement;
    expect(document.activeElement).toBe(textarea);
    expect(textarea.getAttribute('aria-label')).toBe('What should change?');
    expect(btn(fixture, 'send-changes')!.disabled).toBe(true);

    textarea.value = '   ';
    textarea.dispatchEvent(new Event('input'));
    textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('A comment is required.');
    expect(btn(fixture, 'send-changes')!.disabled).toBe(true);
    http.expectNone(`${BASE}/A1/decide`);

    textarea.value = 'Move the door.';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el(fixture).textContent).not.toContain('A comment is required.');
    btn(fixture, 'send-changes')!.click();
    const req = http.expectOne(`${BASE}/A1/decide`);
    expect(req.request.body).toEqual({ decision: 3, comment: 'Move the door.' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    list('pending').flush(page([]));
    list('decided').flush(page([]));
  });

  it('Escape closes the comment field and returns focus to Request changes', async () => {
    const fixture = render();
    btn(fixture, 'request-changes')!.click();
    fixture.detectChanges();
    const textarea = el(fixture).querySelector('textarea') as HTMLTextAreaElement;
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(el(fixture).querySelector('[data-testid="changes-form"]')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve));
    expect(document.activeElement).toBe(btn(fixture, 'request-changes'));
  });

  it('caps the comment at 2000 characters with an inline error', () => {
    const fixture = render();
    btn(fixture, 'request-changes')!.click();
    fixture.detectChanges();
    const textarea = el(fixture).querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'x'.repeat(2001);
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('Keep the comment to 2000 characters or fewer.');
    expect(btn(fixture, 'send-changes')!.disabled).toBe(true);
  });

  it('409 reloads both lists and toasts', () => {
    const fixture = render();
    btn(fixture, 'approve')!.click();
    http
      .expectOne(`${BASE}/A1/decide`)
      .flush(
        { errors: { 'approvals.AlreadyDecided': ['x'] } },
        { status: 409, statusText: 'Conflict' },
      );
    expect(toast.show).toHaveBeenCalledWith({
      tone: 'warning',
      message: 'This approval was already decided. Your list has been refreshed.',
    });
    list('pending').flush(page([]));
    list('decided').flush(page([]));
  });

  it('404 removes the row and reloads both lists', () => {
    const fixture = render([wire('A1'), wire('A2', { round: 2 })]);
    btn(fixture, 'approve')!.click();
    http
      .expectOne(`${BASE}/A1/decide`)
      .flush(
        { errors: { 'crm.portal.NotFound': ['x'] } },
        { status: 404, statusText: 'Not Found' },
      );
    fixture.detectChanges();
    expect(el(fixture).querySelector('[data-approval="A1"]')).toBeNull();
    expect(el(fixture).querySelector('[data-approval="A2"]')).not.toBeNull();
    list('pending').flush(page([wire('A2', { round: 2 })]));
    list('decided').flush(page([]));
  });

  it('view_own without decide_own shows the rows but no decide buttons', () => {
    perms.set([PERM.crm.approvals.viewOwn]);
    const fixture = render();
    expect(el(fixture).textContent).toContain('Brief round 1');
    expect(btn(fixture, 'approve')).toBeNull();
    expect(btn(fixture, 'request-changes')).toBeNull();
  });

  it('the decided trail shows the decision chip, the date and the comment', () => {
    const fixture = render(
      [],
      [
        wire('D1', {
          decision: 3,
          decidedAtUtc: '2026-07-03T00:00:00Z',
          comment: 'Warmer colours.',
        }),
      ],
    );
    const trail = el(fixture).querySelector('[data-decided="D1"]')!.textContent ?? '';
    expect(trail).toContain('Changes requested');
    expect(trail).toContain('Decided');
    expect(trail).toContain('Warmer colours.');
  });

  // 009b #16, kept: the brief head diff by round.
  it('expands a brief round to its initial values (round 1)', () => {
    const diff: BriefHeadDiff = {
      briefId: 'B',
      round: 1,
      previousRound: null,
      changes: [{ field: 'Sector', previousValue: null, currentValue: '1' }],
    };
    getHeadDiff.mockReturnValue(of(diff));
    const fixture = render();
    (el(fixture).querySelector('li button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(getHeadDiff).toHaveBeenCalledWith('B', 1);
    expect(el(fixture).textContent).toContain('Initial values (round 1):');
    expect(el(fixture).textContent).toContain('Residential');
  });

  it('shows the catalog message for 404 crm.briefs.RoundNotFound', () => {
    getHeadDiff.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { errors: { 'crm.briefs.RoundNotFound': ['No such round.'] } },
          }),
      ),
    );
    const fixture = render();
    (el(fixture).querySelector('li button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('The brief has no such round.');
  });

  it('FINDING-P2-7: a slow diff reply for a row no longer expanded is dropped', () => {
    const slowA1 = new Subject<BriefHeadDiff>();
    const fastA2 = new Subject<BriefHeadDiff>();
    getHeadDiff.mockImplementation((_briefId: string, round: number) =>
      round === 1 ? slowA1 : fastA2,
    );
    const fixture = render([wire('A1'), wire('A2', { round: 2 })]);
    const toggles = () => Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('li button'));
    toggles()[0].click(); // A1, round 1 — slow
    fixture.detectChanges();
    const a2Toggle = el(fixture).querySelector<HTMLButtonElement>('[data-approval="A2"] button')!;
    a2Toggle.click(); // switch to A2 before A1 answers
    fixture.detectChanges();
    fastA2.next({
      briefId: 'B',
      round: 2,
      previousRound: 1,
      changes: [{ field: 'Sector', previousValue: '1', currentValue: '2' }],
    });
    slowA1.next({
      briefId: 'B',
      round: 1,
      previousRound: null,
      changes: [{ field: 'Sector', previousValue: null, currentValue: '1' }],
    });
    fixture.detectChanges();
    const text = el(fixture).textContent ?? '';
    expect(text).not.toContain('Initial values (round 1):');
    expect(text).toContain('Medical');
  });

  it('FINDING-P2-7: an entry reads the brief of its own stage', () => {
    getMyBrief.mockReturnValue(of({ head: null, spaces: [] }));
    const fixture = render([wire('E1', { subjectType: 4, subjectId: 'SP', stageId: 'ST9' })]);
    (el(fixture).querySelector('li button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(getMyBrief).toHaveBeenCalledWith('P', 'ST9');
  });

  it('carries every new inbox key in EN and AR', () => {
    const keys = Object.keys(EN).filter((k) =>
      [
        'appr.loadFailed',
        'appr.decisionSent',
        'appr.alreadyDecidedReloaded',
        'appr.goneReloaded',
        'appr.requestChanges',
        'appr.changesComment',
        'appr.commentRequired',
        'appr.commentTooLong',
        'appr.sendChanges',
        'appr.briefRound',
        'appr.viewBrief',
        'appr.viewEntry',
        'appr.viewProject',
        'appr.requestedOn',
        'appr.decidedOn',
        'appr.dueOn',
        'appr.loadMore',
        'appr.pendingEmpty',
        'appr.decidedEmpty',
      ].includes(k),
    ) as (keyof typeof EN)[];
    expect(keys).toHaveLength(19);
    for (const key of keys) expect(AR[key], key).toBeTruthy();
  });
});
