import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { signal } from '@angular/core';
import { LocaleService } from '@platform/i18n';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import { ProjectGrantBannerComponent } from './project-grant-banner.component';
import type { ProjectAccess } from '../../model/access-grant.model';

/** crmp P1-B: "Temporary access: Read only · Documents, Stage 1 · until {date}" / "· no end". */
describe('ProjectGrantBannerComponent (crmp P1-B)', () => {
  function render(
    access: ProjectAccess | null,
    stages = [{ id: 'S1', name: 'Stage 1' }],
    locale: 'en' | 'ar' = 'en',
  ) {
    TestBed.configureTestingModule({
      imports: [ProjectGrantBannerComponent],
      providers: [{ provide: LocaleService, useValue: { locale: signal(locale) } }],
    });
    const f = TestBed.createComponent(ProjectGrantBannerComponent);
    f.componentRef.setInput('access', access);
    f.componentRef.setInput('stages', stages);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('names the level, areas, stages and the end in Cairo time', () => {
    const el = render({
      source: 'Grant',
      level: 'Viewer',
      areas: ['Documents'],
      stageIds: ['S1'],
      expiresAtUtc: '2026-12-01T10:00:00Z',
    });
    const date = formatCairoDateTime('2026-12-01T10:00:00Z', 'en');
    expect(el.querySelector('[data-grant-banner]')?.textContent?.trim()).toBe(
      `Temporary access: Read only · Documents, Stage 1 · until ${date}`,
    );
  });

  it('a whole-project grant with no end says so', () => {
    const el = render({
      source: 'Grant',
      level: 'Editor',
      areas: ['Overview', 'Sites'],
      stageIds: [],
      expiresAtUtc: null,
    });
    expect(el.textContent?.trim()).toBe(
      'Temporary access: Read + write · Overview & progress, Site surveys, Whole project · no end',
    );
  });

  it('renders in Arabic too', () => {
    const el = render(
      { source: 'Grant', level: 'Manager', areas: ['Team'], stageIds: [], expiresAtUtc: null },
      [],
      'ar',
    );
    expect(el.textContent?.trim()).toBe(
      'وصول مؤقت: كاملة · الفريق (قراءة)، المشروع كاملًا · بلا نهاية',
    );
  });

  it('renders nothing for a member or read_all', () => {
    expect(
      render({
        source: 'Member',
        level: 'Manager',
        areas: [],
        stageIds: [],
        expiresAtUtc: null,
      }).querySelector('[data-grant-banner]'),
    ).toBeNull();
    TestBed.resetTestingModule();
    expect(render(null).querySelector('[data-grant-banner]')).toBeNull();
  });
});
