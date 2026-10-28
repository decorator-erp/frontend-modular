import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '@platform/auth/auth.store';
import { PERM } from '@platform/permissions';
import { ThemeService } from '@platform/theme';
import { ClientShellComponent } from './client-shell.component';

/**
 * 009b #46: `POST /api/crm/portal/requirement-items` needs `requirements.submit_own`, which the client
 * baseline does not grant — the "Add requirement" tab shows only to a caller holding it.
 */
describe('ClientShellComponent — the Add requirement tab (009b #46)', () => {
  let perms: string[];

  beforeEach(() => {
    perms = [];
    TestBed.configureTestingModule({
      imports: [ClientShellComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthStore,
          useValue: { can: (p: string) => perms.includes(p), logout: vi.fn() },
        },
        { provide: ThemeService, useValue: { theme: () => 'light', toggle: vi.fn() } },
      ],
    });
  });

  const hrefs = (): string[] => {
    const fixture = TestBed.createComponent(ClientShellComponent);
    fixture.detectChanges();
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('nav a'),
    ).map((a) => a.getAttribute('href') ?? '');
  };

  it('is hidden without requirements.submit_own', () => {
    expect(hrefs()).toEqual(['/portal', '/portal/schedule', '/portal/approvals']);
  });

  it('is shown with requirements.submit_own', () => {
    perms = [PERM.requirements.submitOwn];
    expect(hrefs()).toEqual([
      '/portal',
      '/portal/schedule',
      '/portal/add-requirement',
      '/portal/approvals',
    ]);
  });
});
