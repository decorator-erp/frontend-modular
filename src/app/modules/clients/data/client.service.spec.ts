import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ClientService } from './client.service';
import type { ClientResponse } from '../model/client.model';

/** crm-prod M8: the routes Crm.Infrastructure `ClientEndpoints.cs` maps under `/api/clients`. */
describe('ClientService (crm-prod M8)', () => {
  let service: ClientService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ClientService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getAll reads GET /clients?isActive=all&pageNumber=1&pageSize=200 and maps ClientListItemResponse', () => {
    let rows: ClientResponse[] = [];
    service.getAll().subscribe((r) => (rows = r));

    const call = http.expectOne(
      (r) =>
        r.urlWithParams === `${environment.apiUrl}/clients?isActive=all&pageNumber=1&pageSize=200`,
    );
    expect(call.request.method).toBe('GET');
    call.flush({
      items: [
        {
          id: 'c1',
          displayName: 'Hana Saleh',
          email: 'hana@example.com',
          address: 'New Cairo',
          jobTitle: null,
          representativeName: null,
          isActive: true,
          createdAtUtc: '2026-10-01T00:00:00Z',
        },
      ],
      pageNumber: 1,
      pageSize: 200,
      totalCount: 1,
      totalPages: 1,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('c1');
    expect(`${rows[0].firstName} ${rows[0].lastName}`.trim()).toBe('Hana Saleh');
    expect(rows[0].email).toBe('hana@example.com');
    expect(rows[0].address).toBe('New Cairo');
  });

  it('FINDING-P2-5: the list row keeps jobTitle and representativeName', () => {
    let rows: ClientResponse[] = [];
    service.getAll().subscribe((r) => (rows = r));
    http
      .expectOne((r) => r.url === `${environment.apiUrl}/clients`)
      .flush({
        items: [
          {
            id: 'c1',
            displayName: 'Hana Saleh',
            email: null,
            address: 'New Cairo',
            jobTitle: 'Architect',
            representativeName: 'Omar Saleh',
            isActive: true,
            createdAtUtc: '2026-10-01T00:00:00Z',
          },
        ],
        pageNumber: 1,
        pageSize: 200,
        totalCount: 1,
        totalPages: 1,
      });
    expect(rows[0].jobTitle).toBe('Architect');
    expect(rows[0].representativeName).toBe('Omar Saleh');
  });

  it('FINDING-P2-5: getById reads GET /clients/{id} (ClientResponse) with maritalStatus', () => {
    let client: ClientResponse | undefined;
    service.getById('c1').subscribe((c) => (client = c));
    const call = http.expectOne(`${environment.apiUrl}/clients/c1`);
    expect(call.request.method).toBe('GET');
    call.flush({
      id: 'c1',
      appUserId: 'u1',
      address: 'New Cairo',
      notes: null,
      jobTitle: 'Architect',
      maritalStatus: 'Married',
      representativeName: 'Omar Saleh',
      children: [],
      isActive: true,
    });
    expect(client?.jobTitle).toBe('Architect');
    expect(client?.maritalStatus).toBe('Married');
    expect(client?.representativeName).toBe('Omar Saleh');
  });

  it('activate sends PUT /clients/{id}/active with SetActiveRequest { isActive: true }', () => {
    service.activate('c1').subscribe();
    const call = http.expectOne(`${environment.apiUrl}/clients/c1/active`);
    expect(call.request.method).toBe('PUT');
    expect(call.request.body).toEqual({ isActive: true });
    call.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('deactivate sends PUT /clients/{id}/active with { isActive: false } and no userId query', () => {
    service.deactivate('c1').subscribe();
    const call = http.expectOne(`${environment.apiUrl}/clients/c1/active`);
    expect(call.request.method).toBe('PUT');
    expect(call.request.urlWithParams).not.toContain('userId');
    expect(call.request.body).toEqual({ isActive: false });
    call.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('update sends PUT /clients/{id}/profile with exactly UpdateProfileRequest', () => {
    service
      .update('c1', { jobTitle: 'Engineer', maritalStatus: null, representativeName: 'Omar' })
      .subscribe();
    const call = http.expectOne(`${environment.apiUrl}/clients/c1/profile`);
    expect(call.request.method).toBe('PUT');
    expect(call.request.body).toEqual({
      jobTitle: 'Engineer',
      maritalStatus: null,
      representativeName: 'Omar',
    });
    call.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('create POSTs CreateClientCommand (phoneNumber, no userName) and reads { clientId }', () => {
    let id: unknown;
    service
      .create({
        firstName: 'Hana',
        lastName: 'Saleh',
        email: 'hana@example.com',
        userName: 'hana',
        password: 'not-a-real-secret',
        phone: '0100000000',
        address: 'New Cairo',
      })
      .subscribe((r) => (id = r));
    const call = http.expectOne(`${environment.apiUrl}/clients`);
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({
      email: 'hana@example.com',
      password: 'not-a-real-secret',
      firstName: 'Hana',
      lastName: 'Saleh',
      address: 'New Cairo',
      phoneNumber: '0100000000',
      notes: null,
    });
    call.flush({ clientId: 'c9' }, { status: 201, statusText: 'Created' });
    expect(id).toBe('c9');
  });

  it('deleteClient sends DELETE /clients/{id} with no userId query', () => {
    service.deleteClient('c1').subscribe();
    const call = http.expectOne(`${environment.apiUrl}/clients/c1`);
    expect(call.request.method).toBe('DELETE');
    call.flush(null, { status: 204, statusText: 'No Content' });
  });
});
