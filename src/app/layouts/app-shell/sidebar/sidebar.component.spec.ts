import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthStore } from '@platform/auth/auth.store';
import type { NavItem } from '../nav-config';
import { NavAccessService } from '../nav-access.service';
import { SidebarComponent } from './sidebar.component';

function render(
  inputs: { mode?: 'full' | 'rail'; drawer?: boolean; collapsible?: boolean },
  canAccess: (item: NavItem) => boolean = () => true,
) {
  TestBed.configureTestingModule({
    imports: [SidebarComponent],
    providers: [
      provideRouter([]),
      { provide: NavAccessService, useValue: { canAccess } },
      {
        provide: AuthStore,
        useValue: {
          user: () => ({ userName: 'Mona', email: 'mona@example.com' }),
          logout: vi.fn(),
        },
      },
    ],
  });
  const f = TestBed.createComponent(SidebarComponent);
  for (const [k, v] of Object.entries(inputs)) f.componentRef.setInput(k, v);
  f.detectChanges();
  return f;
}

describe('SidebarComponent (RD-1 dark brand sidebar)', () => {
  it('full mode shows the section headings and every label', () => {
    const el = render({ mode: 'full' }).nativeElement as HTMLElement;
    expect(el.querySelector('aside')?.getAttribute('data-mode')).toBe('full');
    expect(el.textContent).toContain('Operations');
    expect(el.textContent).toContain('Projects');
    expect(el.querySelector('aside')?.className).toContain('bg-sidebar');
  });

  it('rail mode shows icons only, labels moving to the tooltip and aria-label', () => {
    const el = render({ mode: 'rail' }).nativeElement as HTMLElement;
    expect(el.querySelector('aside')?.getAttribute('data-mode')).toBe('rail');
    expect(el.textContent).not.toContain('Operations');
    const projects = el.querySelector('a[aria-label="Projects"]');
    expect(projects).not.toBeNull();
    expect(projects?.textContent?.trim()).toBe('');
  });

  it('the collapse toggle shows on desktop only and emits toggle', () => {
    const f = render({ mode: 'full', collapsible: true });
    const toggled = vi.fn();
    f.componentInstance.toggleCollapse.subscribe(toggled);
    const btn = (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-sidebar-toggle]',
    )!;
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    btn.click();
    expect(toggled).toHaveBeenCalledTimes(1);

    TestBed.resetTestingModule();
    const drawer = render({ mode: 'full', drawer: true }).nativeElement as HTMLElement;
    expect(drawer.querySelector('[data-sidebar-toggle]')).toBeNull();
    expect(drawer.querySelector('[data-sidebar-close]')).not.toBeNull();
  });

  it('keeps the permission gate: an item the caller cannot open is shown disabled', () => {
    const el = render({ mode: 'full' }, (item) => item.route !== '/roles')
      .nativeElement as HTMLElement;
    expect(el.querySelector('a[aria-label="Roles"]')).toBeNull();
    expect(el.querySelector('[aria-disabled="true"][aria-label^="Roles"]')).not.toBeNull();
  });
});
