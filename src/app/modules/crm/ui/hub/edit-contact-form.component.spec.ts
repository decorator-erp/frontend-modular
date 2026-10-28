import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { CrmContact, CrmContactService } from '../../data/crm-contact.service';
import { ContactRole } from '../../model/crm-enums';
import { CrmEditContactFormComponent } from './edit-contact-form.component';

describe('CrmEditContactFormComponent — FINDING-5-3', () => {
  it('carries the stored email, mobile and notes into the PUT body (the backend overwrites all seven)', () => {
    const contact: CrmContact = {
      id: 'K',
      clientId: 'C',
      firstName: 'Mona',
      lastName: 'Adel',
      email: 'mona@example.com',
      phone: '0501234567',
      mobile: '0111',
      role: ContactRole.Owner,
      isPrimary: true,
      notes: 'Prefers mornings',
    };
    const update = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      imports: [CrmEditContactFormComponent],
      providers: [
        { provide: CrmContactService, useValue: { update } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: PeraModalRef, useValue: { close: vi.fn() } },
        { provide: PERA_MODAL_DATA, useValue: { clientId: 'C', contact } },
      ],
    });
    const c = TestBed.createComponent(CrmEditContactFormComponent).componentInstance;
    c.form.controls.firstName.setValue(' Mona ');

    c.submit();

    expect(update).toHaveBeenCalledWith('C', 'K', {
      firstName: 'Mona',
      lastName: 'Adel',
      role: ContactRole.Owner,
      phone: '0501234567',
      email: 'mona@example.com',
      mobile: '0111',
      notes: 'Prefers mornings',
    });
  });
});
