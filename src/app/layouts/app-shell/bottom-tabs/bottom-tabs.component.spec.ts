import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { PermissionsService } from '@platform/permissions';
import { describe, expect, it, vi } from 'vitest';
import type { NavItem } from '../nav-config';
import { NavAccessService } from '../nav-access.service';
import { BottomTabsComponent } from './bottom-tabs.component';

function render(canAccess: (item: NavItem) => boolean, can: (cap: string) => boolean = () => true) {
  TestBed.configureTestingModule({
    imports: [BottomTabsComponent],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: NavAccessService, useValue: { canAccess } },
      { provide: PermissionsService, useValue: { can } },
    ],
  });
  const f = TestBed.createComponent(BottomTabsComponent);
  f.detectChanges();
  return f;
}

describe('BottomTabsComponent (RD-1 phone navigation)', () => {
  it('shows Home, Projects, Leads and Surveys, then More', () => {
    const f = render(() => true);
    const el = f.nativeElement as HTMLElement;
    const labels = Array.from(el.querySelectorAll('[data-tab]')).map((a) => a.textContent?.trim());
    expect(labels).toEqual(['Home', 'Projects', 'Leads', 'Surveys']);
    expect(el.querySelector('[data-tab-more]')?.textContent).toContain('More');
  });

  it('hides a tab the caller cannot open — the same check as the sidebar', () => {
    const f = render((item) => item.route !== '/crm/leads' && item.route !== '/sites');
    const labels = Array.from((f.nativeElement as HTMLElement).querySelectorAll('[data-tab]')).map(
      (a) => a.textContent?.trim(),
    );
    expect(labels).toEqual(['Home', 'Projects']);
  });

  it('"More" asks for the full menu and reflects whether it is open', () => {
    const f = render(() => true);
    const more = vi.fn();
    f.componentInstance.more.subscribe(more);
    const btn = (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-tab-more]',
    )!;
    btn.click();
    expect(more).toHaveBeenCalledTimes(1);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    f.componentRef.setInput('moreOpen', true);
    f.detectChanges();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('puts New project in the middle of the bar, only for a caller who may create projects', () => {
    const allowed = render(
      () => true,
      (cap) => cap === 'project.create',
    );
    const fab = (allowed.nativeElement as HTMLElement).querySelector('[data-fab-new-project]');
    expect(fab?.getAttribute('href')).toBe('/projects/new');
    expect(fab?.getAttribute('aria-label')).toBe('New project');
    // OS-2: Home, Projects, +, Leads, Surveys, More.
    const nav = (allowed.nativeElement as HTMLElement).querySelector('nav')!;
    expect(nav.children[2].contains(fab!)).toBe(true);
    expect(nav.style.gridTemplateColumns).toContain('repeat(6');

    TestBed.resetTestingModule();
    const denied = render(
      () => true,
      () => false,
    );
    expect(
      (denied.nativeElement as HTMLElement).querySelector('[data-fab-new-project]'),
    ).toBeNull();
  });

  it('offers New lead instead on Leads, gated by crm.leads.create', async () => {
    const f = render(
      () => true,
      (cap) => cap === 'crm.leads.create' || cap === 'project.create',
    );
    await TestBed.inject(Router).navigateByUrl('/crm/leads');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-fab-new-project]')).toBeNull();
    const lead = el.querySelector('[data-fab-new-lead]');
    expect(lead?.getAttribute('aria-label')).toBe('New lead');
    expect(lead?.getAttribute('href')).toBe('/crm/leads?new=1');
  });
});
