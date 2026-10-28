import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { ContactRole } from '../../model/crm-enums';
import { CrmContactService } from '../../data/crm-contact.service';
import type { CrmContact } from '../../data/crm-contact.service';
import { ClientHubStore } from '../../stores/client-hub.store';
import { ClientHubOverviewTabComponent } from './overview-tab.component';

const contact: CrmContact = {
  id: 'K',
  clientId: 'C',
  firstName: 'Mona',
  lastName: 'Adel',
  email: null,
  phone: null,
  mobile: null,
  role: ContactRole.Owner,
  isPrimary: false,
  notes: null,
};

function conflict(code: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 409,
    error: { status: 409, title: code, errors: { [code]: ['changed'] } },
  });
}

function make(contactsApi: Partial<CrmContactService>) {
  const show = vi.fn();
  const reloadContacts = vi.fn();
  TestBed.configureTestingModule({
    imports: [ClientHubOverviewTabComponent],
    providers: [
      { provide: CrmContactService, useValue: contactsApi },
      { provide: ToastService, useValue: { show } },
      {
        provide: ClientHubStore,
        useValue: {
          client: signal({ id: 'C' }),
          clientName: signal('Mona Adel'),
          contacts: signal([contact]),
          notes: signal([]),
          selectedProjectId: signal(null),
          reloadContacts,
          reloadNotes: vi.fn(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ClientHubOverviewTabComponent);
  fixture.detectChanges();
  return { c: fixture.componentInstance, show, reloadContacts };
}

describe('ClientHubOverviewTabComponent', () => {
  describe('setPrimary (009b #32)', () => {
    it('reloads the contacts on 409 crm.contacts.ConcurrentPrimaryChange, no error toast', () => {
      const setPrimary = vi.fn(() =>
        throwError(() => conflict('crm.contacts.ConcurrentPrimaryChange')),
      );
      const { c, show, reloadContacts } = make({ setPrimary });

      c['setPrimary'](contact);

      expect(setPrimary).toHaveBeenCalledWith('C', 'K');
      expect(reloadContacts).toHaveBeenCalledTimes(1);
      expect(show).toHaveBeenCalledTimes(1);
      expect(show).toHaveBeenCalledWith({
        tone: 'info',
        message: 'Changed by someone else — reloaded.',
      });
    });
  });
});
