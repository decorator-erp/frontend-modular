import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrmDesignProfileService } from '../../data/crm-design-profile.service';
import { CrmPeriodService } from '../../data/crm-period.service';
import type { ClientDesignProfile } from '../../model';
import { CrmDesignProfileComponent } from './design-profile.component';

const PROFILE: ClientDesignProfile = {
  projectId: 'P',
  preferredStyle: 'Modern',
  preferredColors: null,
  furnitureStatus: null,
  hiringReasons: 0,
  architecturalRequests: null,
  otherNeeds: null,
};

describe('CrmDesignProfileComponent (009b #17)', () => {
  let getFor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getFor = vi.fn().mockReturnValue(of(PROFILE));
    TestBed.configureTestingModule({
      imports: [CrmDesignProfileComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['projectId', 'P']]) } },
        },
        { provide: CrmDesignProfileService, useValue: { getFor } },
        { provide: CrmPeriodService, useValue: { list: vi.fn().mockReturnValue(of([])) } },
      ],
    });
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(CrmDesignProfileComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the preferences it has and "not available" for the client card and the other sections', () => {
    const el = render();
    expect(el.textContent).toContain('Modern');
    const unavailable = [...el.querySelectorAll('[data-testid="dp-unavailable"]')].map(
      (n) => n.textContent ?? '',
    );
    expect(unavailable).toHaveLength(6);
    expect(unavailable.every((t) => t.includes('Not available yet.'))).toBe(true);
  });

  it('treats 404 crm.briefs.NotFound as "no brief yet", not an error', () => {
    getFor.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { errors: { 'crm.briefs.NotFound': ['Design brief not found.'] } },
          }),
      ),
    );
    const el = render();
    expect(el.textContent).toContain('No brief yet');
    expect(el.textContent).not.toContain('Could not load the design profile.');
  });
});
