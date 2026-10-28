import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { CrmSpaceService } from '../../data/crm-space.service';
import type { CrmSpace, CrmSpaceType } from '../../model';
import { CrmAddSpaceDialogComponent } from './add-space-dialog.component';
import type { AddSpaceDialogData } from './add-space-dialog.component';

const types: CrmSpaceType[] = [
  { id: 'T1', code: 'living', nameEn: 'Living', nameAr: 'معيشة', sortOrder: 1, isActive: true },
  { id: 'T2', code: 'attic', nameEn: 'Attic', nameAr: 'علية', sortOrder: 2, isActive: false },
  { id: 'T3', code: 'kids', nameEn: 'Kids', nameAr: 'أطفال', sortOrder: 3, isActive: true },
];

function make(data: AddSpaceDialogData, api: Partial<CrmSpaceService> = {}) {
  TestBed.configureTestingModule({
    imports: [CrmAddSpaceDialogComponent],
    providers: [
      { provide: CrmSpaceService, useValue: api },
      { provide: ToastService, useValue: { show: vi.fn() } },
      { provide: PeraModalRef, useValue: { close: vi.fn() } },
      { provide: PERA_MODAL_DATA, useValue: data },
    ],
  });
  return TestBed.createComponent(CrmAddSpaceDialogComponent).componentInstance;
}

describe('CrmAddSpaceDialogComponent — space-type picker (009b #27)', () => {
  it('offers only active types for a new space', () => {
    const c = make({ projectId: 'P', spaceTypes: types });
    expect(c['typeOptions'].map((o) => o.value)).toEqual(['T1', 'T3']);
  });

  it("keeps an existing space's inactive type so its label still resolves", () => {
    const existing = {
      id: 'S',
      name: 'Attic room',
      spaceType: types[1],
    } as unknown as CrmSpace;
    const c = make({ projectId: 'P', spaceTypes: types, existing });
    expect(c['typeOptions']).toEqual([
      { value: 'T1', label: 'Living' },
      { value: 'T2', label: 'Attic' },
      { value: 'T3', label: 'Kids' },
    ]);
  });
});

describe('CrmAddSpaceDialogComponent — duplicate name (009b #29)', () => {
  it('shows space.nameTaken for a 409 crm.spaces.DuplicateName', () => {
    const duplicate = new HttpErrorResponse({
      status: 409,
      error: {
        status: 409,
        title: 'crm.spaces.DuplicateName',
        errors: {
          'crm.spaces.DuplicateName': ['This project already has a space with that name.'],
        },
      },
    });
    const create = vi.fn(() => throwError(() => duplicate));
    const c = make({ projectId: 'P', spaceTypes: types }, { create });
    c.form.setValue({ name: 'Kitchen', spaceTypeId: 'T1', description: '' });

    c.submit();

    expect(create).toHaveBeenCalledWith('P', {
      spaceTypeId: 'T1',
      name: 'Kitchen',
      description: null,
    });
    expect(c.serverError()?.generalMessage).toBe(
      'A space with this name already exists in the project.',
    );
  });
});
