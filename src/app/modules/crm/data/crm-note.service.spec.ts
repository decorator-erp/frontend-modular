import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ToastService } from '@platform/feedback/toast.service';
import { errorInterceptor } from '@platform/http/error.interceptor';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { CrmNoteService } from './crm-note.service';

describe('CrmNoteService (009b #33)', () => {
  let service: CrmNoteService;
  let http: HttpTestingController;
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        CrmNoteService,
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
      ],
    });
    service = TestBed.inject(CrmNoteService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = (path: string) => `${environment.apiUrl}${path}`;
  const notAuthor = {
    status: 403,
    title: 'crm.notes.NotAuthor',
    errors: { 'crm.notes.NotAuthor': ["Only the note's author can change or delete it."] },
  };

  it('add emits the id read off the one-property 201 body', () => {
    let id: string | undefined;
    service.add('C', { content: 'Hi', projectId: null }).subscribe((v) => (id = v));

    const req = http.expectOne({ method: 'POST', url: url('/crm/clients/C/notes') });
    expect(req.request.body).toEqual({ content: 'Hi', projectId: null });
    req.flush({ noteId: 'N' }, { status: 201, statusText: 'Created' });

    expect(id).toBe('N');
  });

  it('getForClient normalizes CrmClientNoteResponse, which has no date', () => {
    let rows: unknown;
    service.getForClient('C').subscribe((v) => (rows = v));
    http
      .expectOne({ method: 'GET', url: url('/crm/clients/C/notes') })
      .flush([{ id: 'N', clientId: 'C', projectId: null, content: 'Hi', writtenById: 'E1' }]);

    expect(rows).toEqual([
      { id: 'N', clientId: 'C', projectId: null, content: 'Hi', writtenById: 'E1' },
    ]);
  });

  it('update marks 403 handled: a NotAuthor 403 is re-thrown with no global toast', () => {
    let error: unknown;
    service.update('N', { content: 'x' }).subscribe({ error: (e: unknown) => (error = e) });

    const req = http.expectOne({ method: 'PUT', url: url('/crm/notes/N') });
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403]);
    req.flush(notAuthor, { status: 403, statusText: 'Forbidden' });

    expect(error).toMatchObject({ status: 403 });
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('remove marks 403 handled: a NotAuthor 403 is re-thrown with no global toast', () => {
    let error: unknown;
    service.remove('N').subscribe({ error: (e: unknown) => (error = e) });

    const req = http.expectOne({ method: 'DELETE', url: url('/crm/notes/N') });
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403]);
    req.flush(notAuthor, { status: 403, statusText: 'Forbidden' });

    expect(error).toMatchObject({ status: 403 });
    expect(toast.show).not.toHaveBeenCalled();
  });
});
