import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionsService } from '@platform/permissions/permissions.service';
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
        { provide: PermissionsService, useValue: { can: () => true } },
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
            // Read only by the pre-#N-6 reorder/delete actions.
            reorderSpace: vi.fn(),
            deleteSpace: vi.fn(),
            setSpaceActive: vi.fn(),
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

  // 009b #N-6: no reorder or delete route (EP/CrmSpaceEndpoints.cs:25-71); deactivate stays.
  it('offers rename and activate/deactivate but no reorder or delete (009b #N-6)', () => {
    const fixture = TestBed.createComponent(CrmSpacesPageComponent);
    fixture.detectChanges();
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].map((b) =>
      b.getAttribute('aria-label'),
    );

    expect(labels).toContain('Rename');
    expect(labels).toContain('Deactivate');
    expect(labels).not.toContain('Move up');
    expect(labels).not.toContain('Move down');
    expect(labels).not.toContain('Delete');
  });
});
