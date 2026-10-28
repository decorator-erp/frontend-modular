import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { CatalogSelectionMode } from '../../../model/crm-enums';
import type { CatalogCategory } from '../../../model';
import { CatalogStore } from '../../../stores/catalog.store';
import { CrmCatalogChildrenListComponent } from './catalog-children-list.component';

const category = (id: string): CatalogCategory => ({
  id,
  parentId: null,
  code: id,
  nameEn: id,
  nameAr: id,
  path: `/${id}/`,
  depth: 0,
  selectionMode: CatalogSelectionMode.None,
  isRequired: false,
  sortOrder: 0,
  isActive: true,
  trackKey: id,
});

// 009b #N-8: no category reorder route exists (CrmCatalogEndpoints.cs:27-98, C §2.11).
describe('CrmCatalogChildrenListComponent (009b #N-8)', () => {
  it('offers no Move up/down, even to a catalog manager', () => {
    TestBed.configureTestingModule({
      imports: [CrmCatalogChildrenListComponent],
      providers: [
        { provide: PermissionsService, useValue: { can: () => true } },
        { provide: CatalogStore, useValue: { categoryChildrenOf: () => [] } },
      ],
    });
    const fixture = TestBed.createComponent(CrmCatalogChildrenListComponent);
    fixture.componentRef.setInput('categories', [category('a'), category('b')]);
    fixture.detectChanges();
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].map((b) =>
      b.getAttribute('aria-label'),
    );

    expect(labels).not.toContain('Move up');
    expect(labels).not.toContain('Move down');
    expect(labels).toHaveLength(2);
  });
});
