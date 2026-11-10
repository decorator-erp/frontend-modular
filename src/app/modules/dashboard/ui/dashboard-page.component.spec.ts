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
      'tasks',
      'projects',
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
      'tasks',
      'projects',
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
});
