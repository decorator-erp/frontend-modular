import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { environment } from '../../../../environments/environment';
import { ClientService } from '../data/client.service';
import { ClientSearchService } from '../data/client-search.service';
import { AddClientDialogComponent } from './add-client-dialog.component';

/** Sync W2-8 (backend S8): list phone, and no Username on add (CreateClientCommand has none). */
describe('clients — sync W2-8', () => {
  it('the client list reads phoneNumber from ClientListItemResponse', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    let phone: string | null | undefined;
    TestBed.inject(ClientSearchService)
      .search({ pageSize: 20 })
      .subscribe((p) => (phone = p.items[0]?.phoneNumber));
    TestBed.inject(HttpTestingController)
      .expectOne((r) => r.url === `${environment.apiUrl}/clients`)
      .flush({
        items: [
          {
            id: 'c1',
            displayName: 'Hana Saleh',
            email: 'h@x.com',
            isActive: true,
            phoneNumber: '0100000000',
          },
        ],
        pageNumber: 1,
        pageSize: 20,
        totalCount: 1,
      });
    expect(phone).toBe('0100000000');
  });

  it('the add-client dialog has no Username field and submits without one', () => {
    const create = vi.fn((_req: unknown) => of('c9'));
    TestBed.configureTestingModule({
      imports: [AddClientDialogComponent],
      providers: [
        { provide: ClientService, useValue: { create } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: PeraModalRef, useValue: { close: vi.fn() } },
        { provide: PERA_MODAL_DATA, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(AddClientDialogComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Username');
    const c = fixture.componentInstance;
    expect(c.form.contains('userName')).toBe(false);
    c.form.setValue({
      firstName: 'Hana',
      lastName: 'Saleh',
      email: 'hana@example.com',
      phone: '0501234567',
      address: 'New Cairo, District 5',
      notes: '',
    });
    c.submit();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).not.toHaveProperty('userName');
  });
});
