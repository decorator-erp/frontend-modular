import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { CrmLookupService } from '../../../data/crm-lookup.service';
import { CatalogAdminStore } from '../../../stores/catalog-admin.store';
import { CrmCatalogService } from '../../../data/crm-catalog.service';
import { CatalogSelectionMode } from '../../../model/crm-enums';
import type { CatalogCategory, CrmSpaceType } from '../../../model';
import { CrmCatalogCategoryDetailComponent } from './catalog-category-detail.component';

const types: CrmSpaceType[] = [
  { id: 'T1', code: 'living', nameEn: 'Living', nameAr: 'معيشة', sortOrder: 1, isActive: true },
  { id: 'T2', code: 'attic', nameEn: 'Attic', nameAr: 'علية', sortOrder: 2, isActive: false },
  { id: 'T3', code: 'kids', nameEn: 'Kids', nameAr: 'أطفال', sortOrder: 3, isActive: true },
];

describe('CrmCatalogCategoryDetailComponent — targeting picker (009b #27)', () => {
  function make(mapped: string[]) {
    TestBed.configureTestingModule({
      imports: [CrmCatalogCategoryDetailComponent],
      providers: [
        { provide: CrmLookupService, useValue: { spaceTypes: () => of(types) } },
        {
          provide: CatalogAdminStore,
          useValue: {
            currentCategory: signal(null),
            effectiveAttributes: signal([]),
            items: signal([]),
            spaceTypeIds: signal(mapped),
          },
        },
      ],
    });
    return TestBed.createComponent(CrmCatalogCategoryDetailComponent).componentInstance;
  }

  // 009b #N-7: the current mappings cannot be read, so every active type is offered.
  it('offers every active type for a new mapping (009b #N-7)', () => {
    const c = make(['T3']);
    expect(c.unmappedSpaceTypeOptions().map((o) => o.value)).toEqual(['T1', 'T3']);
  });

  it('still names an inactive type on an existing mapping', () => {
    const c = make(['T2']);
    expect(c.spaceTypeName('T2')).toBe('Attic');
  });
});

describe('CrmCatalogCategoryDetailComponent — targeting read (009b #34)', () => {
  it('renders the current mappings as "not available" instead of "global"', () => {
    TestBed.configureTestingModule({
      imports: [CrmCatalogCategoryDetailComponent],
      providers: [
        { provide: CrmLookupService, useValue: { spaceTypes: () => of(types) } },
        { provide: CrmCatalogService, useValue: {} },
        {
          provide: CatalogAdminStore,
          useValue: {
            currentCategory: signal<CatalogCategory>({
              id: 'C',
              parentId: null,
              code: 'c',
              nameEn: 'Cat',
              nameAr: 'Cat',
              path: '/C/',
              depth: 0,
              selectionMode: CatalogSelectionMode.None,
              isRequired: false,
              sortOrder: 0,
              isActive: true,
              trackKey: 'C',
            }),
            effectiveAttributes: signal([]),
            items: signal([]),
            spaceTypeIds: signal([]),
            spaceTypesLoading: signal(false),
            saving: signal(false),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(CrmCatalogCategoryDetailComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="cat-targeting-unavailable"]')?.textContent).toContain(
      'Not available yet.',
    );
    expect(el.textContent).not.toContain('No mappings');
  });
});
