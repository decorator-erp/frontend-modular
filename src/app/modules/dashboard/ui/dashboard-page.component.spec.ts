import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { EMPLOYEE, MANAGER, setupDashboard } from '../data/dashboard.store.spec';
import { DashboardPageComponent } from './dashboard-page.component';

async function render(perms: string[]) {
  setupDashboard(perms);
  TestBed.configureTestingModule({
    imports: [DashboardPageComponent],
    providers: [provideRouter([])],
  });
  const f = TestBed.createComponent(DashboardPageComponent);
  f.detectChanges();
  await new Promise((r) => setTimeout(r, 0));
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}

const attrs = (el: HTMLElement, sel: string, attr: string) =>
  Array.from(el.querySelectorAll(sel)).map((n) => n.getAttribute(attr));

describe('DashboardPageComponent (DB-1)', () => {
  it('an employee sees their projects, tasks and notifications — no approvals, leads or gathering work', async () => {
    const el = await render(EMPLOYEE);
    expect(attrs(el, '[data-widget]', 'data-widget')).toEqual([
      'projects',
      'tasks',
      'notifications',
    ]);
    expect(attrs(el, '[data-kpi]', 'data-kpi')).toEqual(['projects', 'tasks', 'unread']);
    expect(el.querySelector('[data-quick="new-project"]')).toBeNull();
    expect(el.querySelector('[data-quick="sites"]')).not.toBeNull();
    expect(el.querySelector('[data-dash-greeting]')?.textContent).toContain('Mona');
  });

  it('a manager sees every widget and the New project action', async () => {
    const el = await render(MANAGER);
    expect(attrs(el, '[data-widget]', 'data-widget')).toEqual([
      'projects',
      'tasks',
      'gathering',
      'approvals',
      'leads',
      'notifications',
    ]);
    expect(attrs(el, '[data-kpi]', 'data-kpi')).toEqual([
      'projects',
      'tasks',
      'leads',
      'approvals',
    ]);
    expect(el.querySelector('[data-quick="new-project"]')?.getAttribute('href')).toBe(
      '/projects/new',
    );
  });

  it('shows a welcome state, not an empty page, when no widget is open to the user', async () => {
    const el = await render([]);
    expect(el.querySelector('[data-dash-empty]')).not.toBeNull();
    expect(el.querySelectorAll('[data-widget]')).toHaveLength(0);
  });

  it('filters My projects over the loaded rows: Active by default, then All (OS-3)', async () => {
    const el = await render(MANAGER);
    const names = () =>
      Array.from(el.querySelectorAll('[data-dash-project]')).map((a) => a.getAttribute('href'));
    // P2 is Completed, so Active leaves it out.
    expect(names()).not.toContain('/projects/P2');
    expect(names()).toHaveLength(3);
    const all = Array.from(
      el.querySelectorAll<HTMLButtonElement>('[data-project-filter] button'),
    ).at(-1)!;
    all.click();
    TestBed.inject(ApplicationRef).tick();
    expect(names()).toContain('/projects/P2');
    expect(el.querySelectorAll('[data-dash-project] [data-swatch]').length).toBe(4);
  });

  it('groups my tasks and draws the leads pipeline as one stacked bar (OS-3)', async () => {
    const el = await render(MANAGER);
    const groups = attrs(el, '[data-task-group]', 'data-task-group');
    expect(groups.length).toBeGreaterThan(0);
    expect(groups[groups.length - 1]).toBe('later'); // T4 has no due date
    expect(attrs(el, '[data-pipeline-bar] [data-segment]', 'data-segment')).toEqual([
      'new',
      'contacted',
      'qualified',
      'converted',
    ]);
    expect(el.querySelector('[data-pipeline-bar]')?.getAttribute('aria-label')).toContain('3');
    expect(el.querySelector('[data-approval-review]')?.getAttribute('href')).toBe('/approvals');
  });
});
