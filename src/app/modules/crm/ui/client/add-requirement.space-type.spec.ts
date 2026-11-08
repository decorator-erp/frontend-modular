import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions';
import { CrmItemService } from '../../data/crm-item.service';
import { CrmLookupService } from '../../data/crm-lookup.service';
import { CrmAddRequirementComponent } from './add-requirement.component';

/** Sync F4e: the client's add-requirement form sends a space type (AddPortalItemRequest.SpaceTypeId). */
describe('CrmAddRequirementComponent — space type (sync F4e)', () => {
  function make(canRead: boolean) {
    const items = { portalCreate: vi.fn().mockReturnValue(of('I')) };
    const lookup = {
      spaceTypes: vi.fn().mockReturnValue(
        of([
          { id: 'k', code: 'kitchen', nameEn: 'Kitchen', nameAr: 'مطبخ', isActive: true },
          { id: 'x', code: 'old', nameEn: 'Old', nameAr: 'قديم', isActive: false },
        ]),
      ),
    };
    TestBed.configureTestingModule({
      imports: [CrmAddRequirementComponent],
      providers: [
        { provide: CrmItemService, useValue: items },
        { provide: CrmLookupService, useValue: lookup },
        { provide: PermissionsService, useValue: { can: () => canRead } },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    });
    const f = TestBed.createComponent(CrmAddRequirementComponent);
    f.componentRef.setInput('projectId', 'P');
    f.componentRef.setInput('periodId', 'Per');
    f.detectChanges();
    return { f, c: f.componentInstance, items, lookup };
  }

  it('offers the active space types and sends the picked one', () => {
    const { f, c, items } = make(true);
    expect(f.nativeElement.querySelector('[data-space-type]')).not.toBeNull();
    c.form.patchValue({ title: 'Sofa', spaceTypeId: 'k' });
    c.submit();
    expect(items.portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sofa', spaceTypeId: 'k' }),
    );
  });

  it('without crm.space_types.read there is no picker, no read, and no space type sent', () => {
    const { f, c, items, lookup } = make(false);
    expect(lookup.spaceTypes).not.toHaveBeenCalled();
    expect(f.nativeElement.querySelector('[data-space-type]')).toBeNull();
    c.form.patchValue({ title: 'Sofa' });
    c.submit();
    expect(items.portalCreate).toHaveBeenCalledWith(expect.objectContaining({ spaceTypeId: null }));
  });
});
