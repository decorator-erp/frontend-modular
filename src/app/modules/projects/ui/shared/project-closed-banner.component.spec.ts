import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ProjectClosedBannerComponent } from './project-closed-banner.component';

/** crmp P-9: the read-only banner — inactive, OnHold, Completed or Cancelled (contract §2.17). */
describe('ProjectClosedBannerComponent (crmp P-9)', () => {
  function text(project: { status: string; isActive: boolean }): string {
    TestBed.configureTestingModule({ imports: [ProjectClosedBannerComponent] });
    const f = TestBed.createComponent(ProjectClosedBannerComponent);
    f.componentRef.setInput('project', project);
    f.detectChanges();
    const t =
      (f.nativeElement as HTMLElement).querySelector('[data-closed-banner]')?.textContent ?? '';
    TestBed.resetTestingModule();
    return t;
  }

  it.each([
    [{ status: 'Completed', isActive: true }, 'completed'],
    [{ status: 'OnHold', isActive: true }, 'on hold'],
    [{ status: 'Cancelled', isActive: true }, 'cancelled'],
    [{ status: 'InProgress', isActive: false }, 'inactive'],
  ])('shows the banner for %o', (p, word) => {
    expect(text(p)).toContain(word);
  });

  it('renders nothing for an open project', () => {
    expect(text({ status: 'InProgress', isActive: true })).toBe('');
  });
});
