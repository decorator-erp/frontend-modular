import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PeraModalRef } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { CrmLookupService } from '../../../data/crm-lookup.service';
import { CrmSpaceTypesDialogComponent } from './space-types-dialog.component';

/** Sync F4a: the space types admin. */
describe('CrmSpaceTypesDialogComponent (sync F4a)', () => {
  function make() {
    const api = {
      spaceTypes: vi.fn().mockReturnValue(
        of([
          { id: 'b', code: 'bath', nameEn: 'Bath', nameAr: 'حمام', sortOrder: 2, isActive: false },
          {
            id: 'k',
            code: 'kitchen',
            nameEn: 'Kitchen',
            nameAr: 'مطبخ',
            sortOrder: 1,
            isActive: true,
          },
        ]),
      ),
      createSpaceType: vi.fn().mockReturnValue(of('n')),
      updateSpaceType: vi.fn().mockReturnValue(of(null)),
      setSpaceTypeActive: vi.fn().mockReturnValue(of(null)),
    };
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [CrmSpaceTypesDialogComponent],
      providers: [
        { provide: CrmLookupService, useValue: api },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: PeraModalRef, useValue: { close } },
      ],
    });
    const f = TestBed.createComponent(CrmSpaceTypesDialogComponent);
    f.detectChanges();
    return { f, c: f.componentInstance, api, close };
  }

  it('lists every type by order, inactive ones included', () => {
    const { f } = make();
    const codes = [...f.nativeElement.querySelectorAll('[data-space-type]')].map((r: Element) =>
      r.getAttribute('data-space-type'),
    );
    expect(codes).toEqual(['kitchen', 'bath']);
    expect(
      f.nativeElement.querySelector('[data-space-type="bath"] [data-state]').textContent,
    ).toContain('Inactive');
  });

  it('adds a type with code, both names and order; a bad code sends nothing', () => {
    const { c, api } = make();
    c.draft.set({ code: 'Living Room', nameEn: 'Living', nameAr: 'معيشة', sortOrder: '3' });
    c.add();
    expect(api.createSpaceType).not.toHaveBeenCalled();
    expect(c.error()).toContain('lowercase');
    c.draft.set({ code: 'living_room', nameEn: ' Living ', nameAr: 'معيشة', sortOrder: '3' });
    c.add();
    expect(api.createSpaceType).toHaveBeenCalledWith({
      code: 'living_room',
      nameEn: 'Living',
      nameAr: 'معيشة',
      sortOrder: 3,
    });
  });

  it('edits names and order (never the code) and reports the change on close', () => {
    const { c, api, close } = make();
    const kitchen = c.sorted()[0];
    c.startEdit(kitchen);
    c.patchEdit('nameEn', 'Kitchenette');
    c.patchEdit('sortOrder', '5');
    c.saveEdit(kitchen);
    expect(api.updateSpaceType).toHaveBeenCalledWith('k', {
      nameEn: 'Kitchenette',
      nameAr: 'مطبخ',
      sortOrder: 5,
    });
    c.close();
    expect(close).toHaveBeenCalledWith(true);
  });

  it('switches a type on and off', () => {
    const { c, api } = make();
    c.toggle(c.sorted()[0]);
    c.toggle(c.sorted()[1]);
    expect(api.setSpaceTypeActive.mock.calls).toEqual([
      ['k', false],
      ['b', true],
    ]);
  });
});
