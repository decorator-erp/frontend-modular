import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmService, ModalService } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { environment } from '../../../../environments/environment';
import { StageTemplatesService } from './stage-templates.service';
import { StageTemplatesListComponent } from '../ui/stage-templates/stage-templates-list.component';

/** crmp P-11: template delete — DELETE /stage-templates/{id}; InUse shows its catalog reason. */
describe('stage template delete (crmp P-11)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('deletes on DELETE /api/stage-templates/{id} (TemplateEndpoints.cs:52)', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(StageTemplatesService).remove('TPL1').subscribe();
    expect(http.expectOne(`${environment.apiUrl}/stage-templates/TPL1`).request.method).toBe(
      'DELETE',
    );
    http.verify();
  });

  it('a template in use is refused with stage_templates.InUse in the toast and stays listed', async () => {
    const show = vi.fn();
    const err = new HttpErrorResponse({
      status: 409,
      error: { errors: { 'stage_templates.InUse': ['x'] } },
    });
    TestBed.configureTestingModule({
      imports: [StageTemplatesListComponent],
      providers: [
        provideRouter([]),
        {
          provide: StageTemplatesService,
          useValue: {
            list: () => of([{ id: 'TPL1', name: 'Villa', isActive: true, isDefault: false }]),
            remove: () => throwError(() => err),
          },
        },
        { provide: ConfirmService, useValue: { open: () => Promise.resolve(true) } },
        {
          provide: ModalService,
          useValue: { open: () => ({ afterClosed: () => Promise.resolve(false) }) },
        },
        { provide: ToastService, useValue: { show } },
      ],
    });
    const f = TestBed.createComponent(StageTemplatesListComponent);
    f.detectChanges();
    const c = f.componentInstance;
    await c.remove(c.templates()[0]!);
    expect(show).toHaveBeenCalledWith({
      tone: 'danger',
      message: expect.stringContaining('project was built from this template'),
    });
    expect(c.templates().length).toBe(1);
    expect(c.deleting()).toBe(false);
  });
});
