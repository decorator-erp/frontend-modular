import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrmSpace } from '../../model';
import { SpacesStore } from '../../stores/spaces.store';
import { CrmSpacesPageComponent } from './spaces-page.component';

const SPACE: CrmSpace = {
  id: 'S',
  projectId: 'P',
  spaceType: { id: 'T', code: 'kitchen', nameEn: 'Kitchen', nameAr: 'المطبخ' },
  name: 'Kitchen',
  sortOrder: 0,
  isActive: true,
  description: null,
};

// 009b #N-5: no space-item routes exist on the backend, so the board panels are gone.
describe('CrmSpacesPageComponent (009b #N-5)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CrmSpacesPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ projectId: 'P' }) } },
        },
        {
          provide: SpacesStore,
          useValue: {
            load: vi.fn(),
            spaces: signal([SPACE]),
            spaceTypes: signal([]),
            error: signal(null),
            savingSpace: signal(false),
            currentEntryFor: () => undefined,
            // Read only by the pre-#N-5 board panels.
            incompleteSpaceIds: signal(new Set<string>()),
            board: () => [],
            completeness: () => undefined,
            mutatingBySpace: signal({}),
          },
        },
      ],
    });
  });

  it('keeps the space list and renders no board or completeness panel', () => {
    const fixture = TestBed.createComponent(CrmSpacesPageComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('Kitchen');
    expect(el.querySelector('app-crm-space-brief-note')).not.toBeNull();
    expect(el.querySelector('app-crm-space-board')).toBeNull();
    expect(el.querySelector('app-crm-space-completeness')).toBeNull();
  });
});
