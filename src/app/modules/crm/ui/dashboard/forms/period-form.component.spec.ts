import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { friendlyMessage } from '@platform/errors/error-catalog';
import { CrmPeriodService } from '../../../data/crm-period.service';
import { CrmPeriodFormComponent, PeriodFormDialogData } from './period-form.component';

function coded(code: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 409,
    error: { status: 409, title: code, errors: { [code]: ['x'] } },
  });
}

function make(data: PeriodFormDialogData, api: Partial<CrmPeriodService>) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    imports: [CrmPeriodFormComponent],
    providers: [
      { provide: CrmPeriodService, useValue: api },
      { provide: PERA_MODAL_DATA, useValue: data },
      { provide: PeraModalRef, useValue: { close } },
      { provide: ToastService, useValue: { show: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(CrmPeriodFormComponent);
  fixture.detectChanges();
  const c = fixture.componentInstance;
  c.form.controls.closesAt.setValue('2099-01-01T10:00');
  return { c, close };
}

describe('CrmPeriodFormComponent (009b #26)', () => {
  it('has a catalog message for crm.periods.AlreadyOpen (not the fallback)', () => {
    expect(friendlyMessage('crm.periods.AlreadyOpen', 'fallback')).not.toBe('fallback');
  });

  it('shows the AlreadyOpen message when opening a second period', () => {
    const open = vi.fn(() => throwError(() => coded('crm.periods.AlreadyOpen')));
    const { c, close } = make({ mode: 'open', projectId: 'P' }, { open });

    c.submit();

    expect(c.serverError()?.generalMessage).toBe(
      'This project already has an open requirement period.',
    );
    expect(close).not.toHaveBeenCalled();
  });

  it('closes as done on 409 crm.periods.ConcurrentUpdate so the card reloads (X-3)', () => {
    const extend = vi.fn(() => throwError(() => coded('crm.periods.ConcurrentUpdate')));
    const { c, close } = make(
      {
        mode: 'extend',
        projectId: 'P',
        periodId: 'Per',
        currentClosesAtUtc: '2099-01-01T08:00:00Z',
      },
      { extend },
    );

    c.submit();

    expect(extend).toHaveBeenCalledWith('Per', expect.stringMatching(/Z$/));
    expect(close).toHaveBeenCalledWith(true);
    expect(c.serverError()).toBeNull();
  });
});
