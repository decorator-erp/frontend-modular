import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { friendlyMessage } from '@platform/errors/error-catalog';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { CrmNoteService } from '../../data/crm-note.service';
import { CrmNoteFormComponent } from './note-form.component';

describe('CrmNoteFormComponent — edit (009b #33)', () => {
  it('shows the crm.notes.NotAuthor message when a non-author saves', () => {
    const notAuthor = new HttpErrorResponse({
      status: 403,
      error: {
        status: 403,
        title: 'crm.notes.NotAuthor',
        errors: { 'crm.notes.NotAuthor': ["Only the note's author can change or delete it."] },
      },
    });
    const update = vi.fn(() => throwError(() => notAuthor));
    TestBed.configureTestingModule({
      imports: [CrmNoteFormComponent],
      providers: [
        { provide: CrmNoteService, useValue: { update } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: PeraModalRef, useValue: { close: vi.fn() } },
        {
          provide: PERA_MODAL_DATA,
          useValue: { clientId: 'C', noteId: 'N', initialContent: 'Hi' },
        },
      ],
    });
    const c = TestBed.createComponent(CrmNoteFormComponent).componentInstance;

    c.submit();

    expect(update).toHaveBeenCalledWith('N', { content: 'Hi' });
    expect(c.serverError()?.code).toBe('crm.notes.NotAuthor');
    expect(c.serverError()?.generalMessage).toBe('Only the author can change this note.');
    expect(c.submitting()).toBe(false);
  });

  it('has Arabic copy for crm.notes.NotAuthor (the hub is bilingual)', () => {
    expect(friendlyMessage('crm.notes.NotAuthor', 'fallback', 'ar')).toBe(
      'لا يعدّل هذه الملاحظة إلا كاتبها.',
    );
  });
});
