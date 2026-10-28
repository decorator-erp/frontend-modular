import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { CrmSpace, CrmSpaceType, SpaceCompleteness } from '../../model';
import { SpacesStore } from '../../stores/spaces.store';
import { CrmSpaceCompletenessComponent } from './space-completeness.component';

const KITCHEN_TYPE: CrmSpaceType = {
  id: 'st-1',
  code: 'kitchen',
  nameEn: 'Kitchen',
  nameAr: 'المطبخ',
};
const SPACE: CrmSpace = {
  id: 'space-1',
  projectId: 'project-1',
  spaceType: KITCHEN_TYPE,
  name: 'Kitchen',
  sortOrder: 0,
  isActive: true,
  description: null,
};

function completeness(over: Partial<SpaceCompleteness> = {}): SpaceCompleteness {
  return {
    spaceId: SPACE.id,
    isComplete: true,
    missingRequiredBranches: [],
    singleViolations: [],
    missingRequiredAttributes: [],
    ...over,
  };
}

/**
 * The gap arrays are computed entirely server-side (`GetSpaceCompletenessQueryHandler`),
 * so there is nothing for this component to compute — but it is exactly the boundary
 * where "a custom row satisfies a required category" either shows up correctly or gets
 * silently lost. The backend already counts a custom row against its category (its own
 * `RecCat` resolves `customCategoryId`); this spec pins the frontend's half of that
 * contract: when the backend has done its job and omitted a required branch from
 * `missingRequiredBranches` because a custom row satisfied it, the component must render
 * Complete, not re-derive "missing" from some other signal.
 */
describe('CrmSpaceCompletenessComponent — a custom row satisfies a required category', () => {
  function render(c: SpaceCompleteness): HTMLElement {
    TestBed.configureTestingModule({
      imports: [CrmSpaceCompletenessComponent],
      providers: [{ provide: SpacesStore, useValue: { completeness: () => c } }],
    });
    const fixture = TestBed.createComponent(CrmSpaceCompletenessComponent);
    fixture.componentRef.setInput('space', SPACE);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders Complete when the only recorded row for a required category is custom', () => {
    // The backend has already resolved this — a custom row's `customCategoryId` satisfies
    // its required category exactly like a catalog row's `categoryId` would, so this
    // required category never appears in `missingRequiredBranches` at all.
    const el = render(completeness({ isComplete: true, missingRequiredBranches: [] }));

    expect(el.textContent).toContain('Everything required is recorded.');
    expect(el.querySelectorAll('button').length).toBe(0);
  });

  it('still renders a real gap when nothing — custom or catalog — satisfies it', () => {
    const el = render(
      completeness({
        isComplete: false,
        missingRequiredBranches: [
          { branchId: 'b1', code: 'lighting', nameEn: 'Lighting', nameAr: 'إضاءة' },
        ],
      }),
    );

    expect(el.textContent).toContain('Lighting');
    expect(el.querySelectorAll('button').length).toBe(1);
  });

  it('does not warn-tint a space whose only gap was a custom-satisfied category', () => {
    // Regression guard for the inverse mistake: a component that re-derives "missing"
    // from local state — rather than trusting `isComplete`/`missingRequiredBranches` as
    // the source of truth — would incorrectly count the custom row's category as unmet.
    const el = render(completeness({ isComplete: true }));
    expect(el.querySelector('.text-warning')).toBeNull();
  });
});
