import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ClientHubStore } from './client-hub.store';

describe('ClientHubStore', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ClientHubStore, provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = (path: string) => `${environment.apiUrl}${path}`;
  const store = () => TestBed.inject(ClientHubStore);

  /** `ClientResponse` (`ClientContracts.cs:12-21`): no name, email or phone. */
  const clientResponse = {
    id: 'C',
    appUserId: 'U1',
    address: '12 Nile St',
    notes: null,
    jobTitle: 'Engineer',
    maritalStatus: null,
    representativeName: null,
    children: [{ id: 'K1', gender: 'F', age: 7 }],
    isActive: true,
  };

  const contact = (id: string, firstName: string, lastName: string, isPrimary: boolean) => ({
    id,
    clientId: 'C',
    firstName,
    lastName,
    email: null,
    phone: null,
    mobile: null,
    role: 1,
    isPrimary,
    notes: null,
  });

  function flushSiblings(contacts: unknown[]): void {
    http.expectOne((r) => r.url === url('/projects/by-client/C')).flush({ items: [] });
    http.expectOne(url('/crm/clients/C/contacts')).flush(contacts);
    http.expectOne(url('/crm/clients/C/notes')).flush([]);
  }

  describe('load (009b #30) — the new ClientResponse', () => {
    it('reads GET /clients/C and takes the name from the primary contact', () => {
      const s = store();
      s.load('C');

      http.expectOne({ method: 'GET', url: url('/clients/C') }).flush(clientResponse);
      flushSiblings([contact('K1', 'Omar', 'Fathy', false), contact('K2', 'Mona', 'Adel', true)]);

      expect(s.client()?.id).toBe('C');
      expect(s.client()?.isActive).toBe(true);
      expect(s.client()?.jobTitle).toBe('Engineer');
      expect(s.client()?.children).toEqual([{ id: 'K1', gender: 'F', age: 7 }]);
      expect(s.clientName()).toBe('Mona Adel');
      expect(s.error()).toBeNull();
    });

    it('has an empty name while no primary contact exists', () => {
      const s = store();
      s.load('C');
      http.expectOne(url('/clients/C')).flush(clientResponse);
      flushSiblings([]);

      expect(s.clientName()).toBe('');
    });

    it('turns a 404 crm.clients.NotFound into the client-not-found state', () => {
      const s = store();
      s.load('C');
      http.expectOne(url('/clients/C')).flush(
        {
          status: 404,
          title: 'crm.clients.NotFound',
          errors: { 'crm.clients.NotFound': ['Client was not found.'] },
        },
        { status: 404, statusText: 'Not Found' },
      );
      flushSiblings([]);

      expect(s.client()).toBeNull();
      expect(s.loaded()).toBe(true);
      expect(s.error()).toBe('hub.clientNotFound');
    });

    it('keeps the generic load error for any other failure', () => {
      const s = store();
      s.load('C');
      http
        .expectOne(url('/clients/C'))
        .flush({ status: 500 }, { status: 500, statusText: 'Server Error' });
      flushSiblings([]);

      expect(s.error()).toBe('hub.loadError');
    });
  });
});
