import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { ConfirmService } from '@ds';
import { ContactRole } from '../../model/crm-enums';
import { CrmContactService } from '../../data/crm-contact.service';
import { CrmNoteService } from '../../data/crm-note.service';
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

function make(contactsApi: Partial<CrmContactService>, notesApi: Partial<CrmNoteService> = {}) {
  const show = vi.fn();
  const reloadContacts = vi.fn();
  const reloadNotes = vi.fn();
  TestBed.configureTestingModule({
    imports: [ClientHubOverviewTabComponent],
    providers: [
      { provide: CrmContactService, useValue: contactsApi },
      { provide: CrmNoteService, useValue: notesApi },
      { provide: ConfirmService, useValue: { open: () => Promise.resolve(true) } },
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
          reloadNotes,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ClientHubOverviewTabComponent);
  fixture.detectChanges();
  return { c: fixture.componentInstance, show, reloadContacts, reloadNotes };
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

  describe('deleteNote (009b #33)', () => {
    it('shows the crm.notes.NotAuthor message on a 403 and keeps the list', async () => {
      const notAuthor = new HttpErrorResponse({
        status: 403,
        error: {
          status: 403,
          title: 'crm.notes.NotAuthor',
          errors: { 'crm.notes.NotAuthor': ["Only the note's author can change or delete it."] },
        },
      });
      const remove = vi.fn(() => throwError(() => notAuthor));
      const { c, show, reloadNotes } = make({}, { remove });

      await c['deleteNote']({
        id: 'N',
        clientId: 'C',
        projectId: null,
        content: 'Hi',
        writtenById: 'E2',
      });

      expect(remove).toHaveBeenCalledWith('N');
      expect(reloadNotes).not.toHaveBeenCalled();
      expect(show).toHaveBeenCalledExactlyOnceWith({
        tone: 'danger',
        message: 'Only the author can change this note.',
      });
    });
  });
});
