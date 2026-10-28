import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ContactRole } from '../model/crm-enums';
import { CrmContactService } from './crm-contact.service';

describe('CrmContactService (009b #32)', () => {
  let service: CrmContactService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CrmContactService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmContactService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = (path: string) => `${environment.apiUrl}${path}`;

  it('add emits the id read off the one-property 201 body', () => {
    let id: string | undefined;
    service
      .add('C', { firstName: 'Mona', lastName: 'Adel', role: ContactRole.Owner, isPrimary: true })
      .subscribe((v) => (id = v));

    const req = http.expectOne({ method: 'POST', url: url('/crm/clients/C/contacts') });
    req.flush({ contactId: 'K' }, { status: 201, statusText: 'Created' });

    expect(id).toBe('K');
  });

  it('getForClient normalizes CrmContactResponse, which has no createdAtUtc', () => {
    let rows: unknown;
    service.getForClient('C').subscribe((v) => (rows = v));

    http.expectOne({ method: 'GET', url: url('/crm/clients/C/contacts') }).flush([
      {
        id: 'K',
        clientId: 'C',
        firstName: 'Mona',
        lastName: 'Adel',
        email: null,
        phone: '+20100',
        mobile: null,
        role: ContactRole.Owner,
        isPrimary: true,
        notes: null,
      },
    ]);

    expect(rows).toEqual([
      {
        id: 'K',
        clientId: 'C',
        firstName: 'Mona',
        lastName: 'Adel',
        email: null,
        phone: '+20100',
        mobile: null,
        role: ContactRole.Owner,
        isPrimary: true,
        notes: null,
      },
    ]);
  });
});
