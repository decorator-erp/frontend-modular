import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ModalService } from '@ds';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PERM, PermissionsService } from '@platform/permissions';
import { VariationService } from '../../data/variation.service';
import type { VariationResponse } from '../../model/variation.model';
import { VariationDetailComponent } from './variation-detail.component';

const DRAFT: VariationResponse = {
  id: 'V1',
  kind: 'InternalChange',
  projectId: 'P1',
  projectTaskId: 'T1',
  budgetLineId: null,
  reason: 'Marble upgrade',
  description: 'Old text',
  amount: '500',
  budgetedAmount: '1000',
  chosenAmount: '1500',
  status: 'Draft',
  requestedById: 'E1',
  approvedById: null,
  approvedAt: null,
  sentToClientAt: null,
  signedByClientId: null,
  signedAt: null,
  signedDocumentPath: null,
  resolutionNote: null,
  trackKey: 'V1',
};

/** UI-1: each lifecycle action is shown only with the permission its route requires. */
describe('VariationDetailComponent — permission gating (UI-1)', () => {
  function render(perms: string[]) {
    TestBed.configureTestingModule({
      imports: [VariationDetailComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'V1' }) } },
        },
        { provide: VariationService, useValue: { getById: vi.fn(() => of(DRAFT)) } },
        { provide: ModalService, useValue: { open: vi.fn() } },
        { provide: ErrorHandlerService, useValue: { parse: () => ({}) } },
        { provide: ToastService, useValue: { show: () => undefined } },
        {
          provide: PermissionsService,
          useValue: {
            can: (p: string | string[]) => [p].flat().some((x) => perms.includes(x)),
            canAll: (ps: string[]) => ps.every((x) => perms.includes(x)),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(VariationDetailComponent);
    fixture.detectChanges();
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button.lc-btn'),
    ).map((b) => b.textContent!.trim());
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    return { buttons, text };
  }

  it('a reader sees no lifecycle actions and no description editor', () => {
    const { buttons, text } = render([PERM.finance.read]);
    expect(buttons).toEqual([]);
    expect(text).not.toContain('Save description');
    expect(text).toContain('Old text');
  });

  it('a variation manager gets submit, reject, cancel and the description editor', () => {
    const { buttons, text } = render([PERM.finance.read, PERM.finance.manageVariation]);
    expect(buttons).toEqual(['Submit', 'Reject', 'Cancel']);
    expect(text).toContain('Save description');
  });

  it('approve, sign and apply each need their own permission', () => {
    const { buttons } = render([
      PERM.finance.read,
      PERM.finance.approveVariation,
      PERM.finance.signVariation,
      PERM.finance.applyVariation,
    ]);
    expect(buttons).toEqual(['Approve', 'Sign', 'Apply']);
  });
});
