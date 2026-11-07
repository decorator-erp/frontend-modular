import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { CrmCatalogService } from '../../../data/crm-catalog.service';
import { CatalogSelectionMode } from '../../../model/crm-enums';
import {
  CatalogEntryDialogData,
  CrmCatalogEntryDialogComponent,
} from './catalog-entry-dialog.component';

// crmp C-4 #117: PUT /api/crm/catalog/{kind}/{id} (CrmCatalogEndpoints.cs:107).
describe('CrmCatalogEntryDialogComponent (crmp C-4)', () => {
  const updateEntry = vi.fn();
  const close = vi.fn();

  function make(data: CatalogEntryDialogData) {
    updateEntry.mockReset();
    close.mockReset();
    TestBed.configureTestingModule({
      imports: [CrmCatalogEntryDialogComponent],
      providers: [
        { provide: CrmCatalogService, useValue: { updateEntry } },
        { provide: PeraModalRef, useValue: { close } },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    const fixture = TestBed.createComponent(CrmCatalogEntryDialogComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => TestBed.resetTestingModule());

  it('a category sends code, names, selectionMode and isRequired only', () => {
    const c = make({
      kind: 'categories',
      id: 'C',
      code: 'c',
      nameEn: 'Cat',
      nameAr: 'فئة',
      selectionMode: CatalogSelectionMode.Single,
      isRequired: true,
    });
    updateEntry.mockReturnValue(of(undefined));
    c.submit();
    expect(updateEntry).toHaveBeenCalledWith('categories', 'C', {
      code: 'c',
      nameEn: 'Cat',
      nameAr: 'فئة',
      selectionMode: CatalogSelectionMode.Single,
      isRequired: true,
    });
    expect(close).toHaveBeenCalledWith(true);
  });

  it('an option sends the shared three only', () => {
    const c = make({ kind: 'options', id: 'O', code: 'm', nameEn: 'Modern', nameAr: 'حديث' });
    expect(c.request()).toEqual({ code: 'm', nameEn: 'Modern', nameAr: 'حديث' });
  });

  it('a 409 crm.catalog.CodeTaken stays open with the catalog message', () => {
    const c = make({
      kind: 'items',
      id: 'I',
      code: 'oak',
      nameEn: 'Oak',
      nameAr: 'بلوط',
      isPurchasable: true,
    });
    updateEntry.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errors: { 'crm.catalog.CodeTaken': ['taken'] } },
          }),
      ),
    );
    c.submit();
    expect(c.serverError()?.code).toBe('crm.catalog.CodeTaken');
    expect(c.serverError()?.generalMessage).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
    expect(c.submitting()).toBe(false);
  });
});
