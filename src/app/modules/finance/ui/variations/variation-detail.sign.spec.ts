import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ModalService } from '@ds';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { VariationService } from '../../data/variation.service';
import type { VariationResponse } from '../../model/variation.model';
import { VariationDetailComponent } from './variation-detail.component';
import { VariationSignDialogComponent } from './variation-sign-dialog.component';

function variation(o: Partial<VariationResponse>): VariationResponse {
  return {
    id: 'V1',
    kind: 'ClientDifference',
    projectId: 'P1',
    projectTaskId: 'T1',
    budgetLineId: null,
    reason: 'Marble upgrade',
    description: null,
    amount: '500',
    budgetedAmount: '1000',
    chosenAmount: '1500',
    status: 'Submitted',
    requestedById: 'E1',
    approvedById: null,
    approvedAt: null,
    sentToClientAt: null,
    signedByClientId: null,
    signedAt: null,
    signedDocumentPath: null,
    resolutionNote: null,
    trackKey: 'V1',
    ...o,
  };
}

/** Sync W1-7: a Submitted ClientDifference is approved by signing (dms Variation.cs Approve). */
describe('VariationDetailComponent — sign (sync W1-7)', () => {
  function make(v: VariationResponse, dialogResult: unknown) {
    const api = {
      getById: vi.fn(() => of(v)),
      sign: vi.fn(() => of(undefined)),
      approve: vi.fn(() => of(undefined)),
    };
    const open = vi.fn(() => ({ afterClosed: () => Promise.resolve(dialogResult) }));
    TestBed.configureTestingModule({
      imports: [VariationDetailComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'V1' }) } },
        },
        { provide: VariationService, useValue: api },
        { provide: ModalService, useValue: { open } },
        { provide: ErrorHandlerService, useValue: { parse: () => ({}) } },
        { provide: ToastService, useValue: { show: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(VariationDetailComponent);
    fixture.detectChanges();
    return { c: fixture.componentInstance, api, open };
  }

  it('offers Sign (not Approve) for a Submitted ClientDifference', () => {
    const { c } = make(variation({}), null);
    expect(c.can('sign')).toBe(true);
    expect(c.can('approve')).toBe(false);
    expect(c.reason('approve')).toContain('Sign');
  });

  it('Sign opens the dialog with the project and sends its request', async () => {
    const req = { signedByClientId: 'C1', signedDocumentPath: 'project-documents/D1' };
    const { c, api, open } = make(variation({}), req);
    c.run('sign');
    await Promise.resolve();
    await Promise.resolve();
    expect(open).toHaveBeenCalledWith(VariationSignDialogComponent, {
      size: 'md',
      data: { projectId: 'P1' },
    });
    expect(api.sign).toHaveBeenCalledWith('V1', req);
  });

  it('a cancelled dialog signs nothing', async () => {
    const { c, api } = make(variation({}), null);
    c.run('sign');
    await Promise.resolve();
    await Promise.resolve();
    expect(api.sign).not.toHaveBeenCalled();
  });

  it('an InternalChange approves with no signature and offers no Sign', () => {
    const { c, api } = make(variation({ kind: 'InternalChange' }), null);
    expect(c.can('sign')).toBe(false);
    c.run('approve');
    expect(api.approve).toHaveBeenCalledWith('V1');
  });

  it('Apply is allowed once Approved, whatever the kind', () => {
    expect(make(variation({ status: 'Approved' }), null).c.can('apply')).toBe(true);
  });
});
