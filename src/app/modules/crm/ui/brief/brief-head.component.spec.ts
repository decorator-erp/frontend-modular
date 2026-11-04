import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionsService } from '@platform/permissions';
import type { ParsedApiError } from '@platform/types';
import { ApprovalState } from '../../model/crm-enums';
import type { BriefHead } from '../../model';
import { BriefStore } from '../../stores/brief.store';
import { CrmBriefHeadComponent, headFieldErrors } from './brief-head.component';

const HEAD: BriefHead = {
  id: 'B',
  projectId: 'P',
  projectStageId: 'S',
  createdById: 'E',
  unitType: 2,
  unitCondition: 1,
  address: null,
  floorNo: null,
  unitsPerFloor: null,
  areaSqm: 120,
  buildingKind: null,
  isLicensed: null,
  isRented: null,
  finishingPurpose: null,
  position: null,
  elevatorStatus: null,
  receivesFrequentVisitors: null,
  visitorsNote: null,
  usedDesignerBefore: null,
  designerExperience: null,
  designerExperienceReason: null,
  hiringReasons: 0,
  preferredStyle: null,
  preferredColors: null,
  furnitureStatus: null,
  expectedBudget: null,
  timelinePressure: null,
  architecturalRequests: null,
  otherNeeds: null,
  sector: 3,
  status: ApprovalState.Draft,
  lastMeetingId: 'M',
};

const validation = (errors: Record<string, string[]>): ParsedApiError => ({
  status: 400,
  generalMessage: 'Please correct the errors below.',
  fieldErrors: { data: Object.values(errors).flat() },
  code: null,
  raw: { title: 'Validation.General', status: 400, errors },
});

describe('headFieldErrors (009b #12)', () => {
  it('names the head control behind each Data.<Field> key and drops the rest', () => {
    expect(
      headFieldErrors(
        validation({
          'Data.AreaSqm': ['Area must be greater than 0.'],
          'Data.VisitorsNote': ['Too long.'],
          LastMeetingId: ['x'],
        }),
      ),
    ).toEqual({ areaSqm: ['Area must be greater than 0.'], visitorsNote: ['Too long.'] });
  });
});

describe('CrmBriefHeadComponent — save (009b #12)', () => {
  let store: {
    head: ReturnType<typeof signal<BriefHead | null>>;
    updateHead: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    store = {
      head: signal<BriefHead | null>(HEAD),
      updateHead: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [CrmBriefHeadComponent],
      providers: [
        {
          provide: BriefStore,
          useValue: {
            ...store,
            headRound: signal(0),
            isHeadRoundOutstanding: signal(false),
            sending: signal(false),
            savingHead: signal(false),
            error: signal(null),
          },
        },
        { provide: PermissionsService, useValue: { can: () => true } },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(CrmBriefHeadComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('sends { data, lastMeetingId } with the head sector, and none of the retired fields', () => {
    const fixture = render();
    fixture.componentInstance.save();

    const [request] = store.updateHead.mock.calls[0];
    expect(request.lastMeetingId).toBe('M');
    expect(request.data).toEqual(
      expect.objectContaining({ unitType: 2, unitCondition: 1, areaSqm: 120, sector: 3 }),
    );
    for (const gone of [
      'utilityMetersNote',
      'parentsHobbies',
      'childrenHobbies',
      'hobbiesInDesign',
    ]) {
      expect(request.data).not.toHaveProperty(gone);
    }
  });

  it('places a Data.AreaSqm validation error on the area control', () => {
    const fixture = render();
    fixture.componentInstance.save();
    const [, handlers] = store.updateHead.mock.calls[0];

    handlers.onError(validation({ 'Data.AreaSqm': ['Area must be greater than 0.'] }));
    fixture.detectChanges();

    expect(fixture.componentInstance.errorOf('areaSqm')).toBe('Area must be greater than 0.');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Area must be greater than 0.',
    );
  });
});

describe('CrmBriefHeadComponent — send gate (crm-prod H2)', () => {
  function sendButton(can: (p: string) => boolean): HTMLElement | undefined {
    TestBed.configureTestingModule({
      imports: [CrmBriefHeadComponent],
      providers: [
        {
          provide: BriefStore,
          useValue: {
            head: signal<BriefHead | null>(HEAD),
            updateHead: vi.fn(),
            headRound: signal(0),
            isHeadRoundOutstanding: signal(false),
            sending: signal(false),
            savingHead: signal(false),
            error: signal(null),
          },
        },
        { provide: PermissionsService, useValue: { can } },
      ],
    });
    const fixture = TestBed.createComponent(CrmBriefHeadComponent);
    fixture.detectChanges();
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('pera-button')).find(
      (b) => b.textContent?.trim() === 'Send for confirmation',
    ) as HTMLElement | undefined;
  }

  it('shows Send for confirmation with crm.briefs.send', () => {
    expect(sendButton((p) => p === 'crm.briefs.send')).toBeDefined();
  });

  it('hides Send for confirmation with crm.briefs.manage alone', () => {
    expect(sendButton((p) => p === 'crm.briefs.manage')).toBeUndefined();
  });
});
