import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleService } from '@platform/i18n';
import type { MyAccessGrant } from '../../model/access-grant.model';
import { MyAccessGrantsStore } from '../../stores/my-access-grants.store';
import { SharedWithMePageComponent } from './shared-with-me-page.component';

/** crmp P1-B: the caller's own temporary access. */
describe('SharedWithMePageComponent (crmp P1-B)', () => {
  const row = (o: Partial<MyAccessGrant>): MyAccessGrant => ({
    grantId: 'G1',
    projectId: 'P1',
    projectCode: 'MT-04',
    projectName: 'Marina Tower',
    level: 'Viewer',
    areas: ['Overview', 'Documents'],
    stageIds: [],
    startsAtUtc: '2026-11-01T10:00:00Z',
    expiresAtUtc: '2026-11-11T10:00:00Z',
    reason: 'audit',
    status: 'Active',
    ...o,
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  function render(rows: MyAccessGrant[], opts: { error?: boolean; locale?: 'en' | 'ar' } = {}) {
    const grants = signal(rows);
    const refresh = vi.fn();
    const store = {
      grants,
      loading: signal(false),
      error: signal(!!opts.error),
      hasAny: computed(() => grants().length > 0),
      refresh,
    };
    TestBed.configureTestingModule({
      imports: [SharedWithMePageComponent],
      providers: [
        provideRouter([]),
        { provide: MyAccessGrantsStore, useValue: store },
        { provide: LocaleService, useValue: { locale: signal(opts.locale ?? 'en') } },
      ],
    });
    const f = TestBed.createComponent(SharedWithMePageComponent);
    f.detectChanges();
    return { el: f.nativeElement as HTMLElement, refresh };
  }

  it('re-reads on every visit and lists each project with level, areas, stages and expiry', () => {
    const { el, refresh } = render([
      row({}),
      row({
        grantId: 'G2',
        projectId: 'P2',
        projectName: 'Villa',
        projectCode: '',
        level: 'Editor',
        areas: ['StagesAndTasks'],
        stageIds: ['S1', 'S2'],
        expiresAtUtc: null,
        status: 'Upcoming',
        startsAtUtc: '2026-11-10T10:00:00Z',
      }),
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    const rows = [...el.querySelectorAll<HTMLElement>('[data-shared-row]')];
    expect(rows).toHaveLength(2);
    const link = rows[0].querySelector('[data-project-link]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/projects/P1');
    expect(link.textContent).toContain('Marina Tower');
    expect(link.textContent).toContain('MT-04');
    expect(rows[0].textContent).toContain('Read only');
    expect(rows[0].textContent).toContain('Overview & progress');
    expect(rows[0].textContent).toContain('Whole project');
    expect(rows[0].querySelector('[data-window]')?.textContent?.trim()).toBe('Expires in 3 days');
    expect(rows[1].textContent).toContain('Specific stages (2)');
    expect(rows[1].textContent).toContain('Upcoming');
    expect(rows[1].querySelector('[data-window]')?.textContent?.trim()).toBe(
      'Starts in 2 days · No end',
    );
  });

  it('hours when under a day; Arabic too', () => {
    const { el } = render([row({ expiresAtUtc: '2026-11-08T15:00:00Z' })], { locale: 'ar' });
    const text = el.querySelector('[data-window]')?.textContent ?? '';
    expect(text).toContain('ينتهي');
  });

  it('empty and error states', () => {
    expect(render([]).el.querySelector('[data-empty]')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(render([], { error: true }).el.querySelector('[data-error]')).not.toBeNull();
  });
});
