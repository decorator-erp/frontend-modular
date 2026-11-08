import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { ProjectService } from '../../data/project.service';
import { ChangeStatusDialogComponent } from './change-status-dialog.component';

/** crmp P-9: Completed is refused while stages or tasks are open — the reason shows in the dialog. */
describe('ChangeStatusDialogComponent (crmp P-9)', () => {
  it('shows projects.StagesOpen inline and stays open', () => {
    const err = new HttpErrorResponse({
      status: 409,
      error: { errors: { 'projects.StagesOpen': ['x'] } },
    });
    let closed: unknown = 'open';
    TestBed.configureTestingModule({
      imports: [ChangeStatusDialogComponent],
      providers: [
        { provide: ProjectService, useValue: { setStatus: () => throwError(() => err) } },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: { close: (v: unknown) => (closed = v) } },
        {
          provide: PERA_MODAL_DATA,
          useValue: { projectId: 'P1', projectName: 'Villa', current: 'InProgress' },
        },
      ],
    });
    const f = TestBed.createComponent(ChangeStatusDialogComponent);
    f.detectChanges();
    f.componentInstance.next.set('Completed');
    f.componentInstance.submit();
    f.detectChanges();
    expect(
      (f.nativeElement as HTMLElement).querySelector('[data-status-error]')?.textContent,
    ).toContain('Every stage must be completed');
    expect(f.componentInstance.submitting()).toBe(false);
    expect(closed).toBe('open');
  });
});
