import { TestBed } from '@angular/core/testing';
// TODO(008): throwError returns with the restored fetch-failure case below.
// import { of, throwError } from 'rxjs';
import { of } from 'rxjs';
import { ApprovalService } from '@modules/approvals';
// TODO(009): CrmBriefService and CrmMeetingService land with modules/crm; TODO(007):
// InvoiceService and VariationService with modules/finance; TODO(008): ProjectStageService and
// ProjectTaskService with modules/projects. Each spec restores its imports, the matching mocks and
// providers in beforeEach, and the cases commented out below — they exercise the deep-link arms
// notification-deep-link.ts stubs until then.
// import { CrmBriefService } from '@modules/crm';
// import { CrmMeetingService } from '@modules/crm';
// import { InvoiceService } from '@modules/finance';
// import { ProjectStageService } from '@modules/projects';
// import { ProjectTaskService } from '@modules/projects';
// import { VariationService } from '@modules/finance';
import { NotificationEntityType, NotificationType } from '../model/notification-enums';
// TODO(008): mapNotification and NotificationResponse return with the REST-wire case below.
// import { mapNotification, NotificationResponse, NotificationView } from '../model/notification.model';
import { NotificationView } from '../model/notification.model';
import { NotificationDeepLink } from './notification-deep-link';

function view(
  entityType: NotificationEntityType | null,
  entityId: string | null = 'e1',
): NotificationView {
  return {
    id: 'n1',
    type: NotificationType.TaskAssigned,
    typeName: 'x',
    title: 't',
    body: null,
    entityType,
    entityId,
    createdAtUtc: '2026-07-08T09:00:00Z',
    isUnread: true,
  };
}

describe('NotificationDeepLink', () => {
  let tasks: { getDetails: ReturnType<typeof vi.fn> };
  // let stages: { getDetails: ReturnType<typeof vi.fn> };
  // let invoices: { getById: ReturnType<typeof vi.fn> };
  // let variations: { getById: ReturnType<typeof vi.fn> };
  let approvals: { listPending: ReturnType<typeof vi.fn> };
  // let meetings: { getById: ReturnType<typeof vi.fn> };
  // let briefs: { getBrief: ReturnType<typeof vi.fn> };
  let resolver: NotificationDeepLink;

  beforeEach(() => {
    tasks = { getDetails: vi.fn().mockReturnValue(of({ task: { projectId: 'p1' } })) };
    // stages = { getDetails: vi.fn().mockReturnValue(of({ projectId: 'p2' })) };
    // invoices = { getById: vi.fn().mockReturnValue(of({ projectId: 'p3' })) };
    // variations = { getById: vi.fn().mockReturnValue(of({ projectId: 'p4' })) };
    approvals = { listPending: vi.fn().mockReturnValue(of([{ id: 'e1', projectId: 'p5' }])) };
    // meetings = { getById: vi.fn().mockReturnValue(of({ projectId: 'p6' })) };
    // briefs = { getBrief: vi.fn().mockReturnValue(of({ head: {}, spaces: [] })) };
    TestBed.configureTestingModule({
      providers: [
        NotificationDeepLink,
        // { provide: ProjectTaskService, useValue: tasks },
        // { provide: ProjectStageService, useValue: stages },
        // { provide: InvoiceService, useValue: invoices },
        // { provide: VariationService, useValue: variations },
        { provide: ApprovalService, useValue: approvals },
        // { provide: CrmMeetingService, useValue: meetings },
        // { provide: CrmBriefService, useValue: briefs },
      ],
    });
    resolver = TestBed.inject(NotificationDeepLink);
  });

  it('Project resolves directly without a fetch', async () => {
    expect(await resolver.resolve(view(NotificationEntityType.Project, 'proj1'))).toEqual([
      '/projects',
      'proj1',
    ]);
    expect(tasks.getDetails).not.toHaveBeenCalled();
  });

  // TODO(008): see the imports above.
  // it('ProjectTask fetches the parent projectId and builds the nested route', async () => {
  //   expect(await resolver.resolve(view(NotificationEntityType.ProjectTask, 't1'))).toEqual([
  //     '/projects',
  //     'p1',
  //     'tasks',
  //     't1',
  //   ]);
  //   expect(tasks.getDetails).toHaveBeenCalledWith('t1');
  // });

  // TODO(008): see the imports above.
  // it('ProjectStage builds the nested stage route', async () => {
  //   expect(await resolver.resolve(view(NotificationEntityType.ProjectStage, 's1'))).toEqual([
  //     '/projects',
  //     'p2',
  //     'stages',
  //     's1',
  //   ]);
  // });

  // TODO(007): see the imports above.
  // it('Invoice builds the finance nested route', async () => {
  //   expect(await resolver.resolve(view(NotificationEntityType.Invoice, 'i1'))).toEqual([
  //     '/finance',
  //     'projects',
  //     'p3',
  //     'invoices',
  //     'i1',
  //   ]);
  // });

  // TODO(007): see the imports above.
  // it('Variation builds the finance nested route', async () => {
  //   expect(await resolver.resolve(view(NotificationEntityType.Variation, 'v1'))).toEqual([
  //     '/finance',
  //     'projects',
  //     'p4',
  //     'variations',
  //     'v1',
  //   ]);
  // });

  it('Approval resolves the parent project via the pending list', async () => {
    expect(await resolver.resolve(view(NotificationEntityType.Approval, 'e1'))).toEqual([
      '/projects',
      'p5',
    ]);
  });

  it('Approval that is no longer pending (decided) falls back', async () => {
    approvals.listPending.mockReturnValue(of([{ id: 'other', projectId: 'p9' }]));
    expect(await resolver.resolve(view(NotificationEntityType.Approval, 'e1'))).toEqual([
      '/notifications',
    ]);
  });

  it('no-screen entity types fall back', async () => {
    expect(await resolver.resolve(view(NotificationEntityType.Document, 'd1'))).toEqual([
      '/notifications',
    ]);
    expect(await resolver.resolve(view(NotificationEntityType.GateCondition, 'g1'))).toEqual([
      '/notifications',
    ]);
  });

  // T128 — the CRM entity types, moved out of the default fallback into real case arms.

  // TODO(009): see the imports above.
  // it('Meeting fetches the meeting and lands on its project scheduler', async () => {
  //   expect(await resolver.resolve(view(NotificationEntityType.Meeting, 'm1'))).toEqual([
  //     '/crm/projects',
  //     'p6',
  //     'scheduler',
  //   ]);
  //   expect(meetings.getById).toHaveBeenCalledWith('m1');
  // });

  // TODO(009): see the imports above.
  // it('Meeting with no projectId on the fetched entity falls back', async () => {
  //   meetings.getById.mockReturnValue(of({ projectId: null }));
  //   expect(await resolver.resolve(view(NotificationEntityType.Meeting, 'm1'))).toEqual([
  //     '/notifications',
  //   ]);
  // });

  // The band that ACTUALLY carries brief/item/entry approval traffic (verified against the
  // backend working tree): every one of these notifications arrives as the generic `Approval`
  // entity type, `subjectType` naming which kind of subject it is.

  it('Approval with subjectType DesignBrief lands on the brief page, not just the project', async () => {
    approvals.listPending.mockReturnValue(
      of([{ id: 'e1', projectId: 'p5', subjectType: 'DesignBrief', subjectId: 'brief-1' }]),
    );
    expect(await resolver.resolve(view(NotificationEntityType.Approval, 'e1'))).toEqual([
      '/crm/projects',
      'p5',
      'brief',
    ]);
  });

  it('Approval with subjectType RequirementItem lands on the items board', async () => {
    approvals.listPending.mockReturnValue(
      of([{ id: 'e1', projectId: 'p5', subjectType: 'RequirementItem', subjectId: 'item-1' }]),
    );
    expect(await resolver.resolve(view(NotificationEntityType.Approval, 'e1'))).toEqual([
      '/crm/projects',
      'p5',
      'items',
    ]);
  });

  it('Approval with subjectType BriefSpace lands on the brief page (feature 006 — no checklist route)', async () => {
    approvals.listPending.mockReturnValue(
      of([{ id: 'e1', projectId: 'p5', subjectType: 'BriefSpace', subjectId: 'space-1' }]),
    );
    expect(await resolver.resolve(view(NotificationEntityType.Approval, 'e1'))).toEqual([
      '/crm/projects',
      'p5',
      'brief',
    ]);
  });

  it('Approval with subjectType GateCondition keeps landing on just the parent project', async () => {
    approvals.listPending.mockReturnValue(
      of([{ id: 'e1', projectId: 'p5', subjectType: 'GateCondition', subjectId: 'gate-1' }]),
    );
    expect(await resolver.resolve(view(NotificationEntityType.Approval, 'e1'))).toEqual([
      '/projects',
      'p5',
    ]);
  });

  // Defensive-only: the direct CRM entity types are not raised by the backend today (their
  // traffic arrives as the generic Approval band above), but if a future path ever raises one
  // directly, `entityId` would be the SUBJECT's own id — matched by `subjectId`, not `id`.

  it('a direct DesignBrief entity type resolves via subjectId, not id', async () => {
    approvals.listPending.mockReturnValue(
      of([{ id: 'approval-1', projectId: 'p5', subjectType: 'DesignBrief', subjectId: 'brief-1' }]),
    );
    expect(await resolver.resolve(view(NotificationEntityType.DesignBrief, 'brief-1'))).toEqual([
      '/crm/projects',
      'p5',
      'brief',
    ]);
  });

  it('a direct RequirementItem entity type with no matching pending approval falls back', async () => {
    approvals.listPending.mockReturnValue(of([]));
    expect(await resolver.resolve(view(NotificationEntityType.RequirementItem, 'item-1'))).toEqual([
      '/notifications',
    ]);
  });

  it('RequirementPeriod falls back — no GET-by-id endpoint exists to resolve its project', async () => {
    expect(
      await resolver.resolve(view(NotificationEntityType.RequirementPeriod, 'period-1')),
    ).toEqual(['/notifications']);
    expect(approvals.listPending).not.toHaveBeenCalled();
  });

  it('Lead falls back — no lead screen exists', async () => {
    expect(await resolver.resolve(view(NotificationEntityType.Lead, 'lead-1'))).toEqual([
      '/notifications',
    ]);
  });

  it('a missing entityId falls back without any fetch', async () => {
    expect(await resolver.resolve(view(NotificationEntityType.ProjectTask, null))).toEqual([
      '/notifications',
    ]);
    expect(tasks.getDetails).not.toHaveBeenCalled();
  });

  // TODO(008): see the imports above.
  // it('a fetch failure (403/404/network) falls back gracefully — no dead link', async () => {
  //   tasks.getDetails.mockReturnValue(throwError(() => new Error('403')));
  //   expect(await resolver.resolve(view(NotificationEntityType.ProjectTask, 't1'))).toEqual([
  //     '/notifications',
  //   ]);
  // });

  // TODO(007): see the imports above.
  // it('a fetched entity missing its projectId falls back', async () => {
  //   invoices.getById.mockReturnValue(of({ projectId: null }));
  //   expect(await resolver.resolve(view(NotificationEntityType.Invoice, 'i1'))).toEqual([
  //     '/notifications',
  //   ]);
  // });

  // End-to-end regression for the QA-observed failure: a REST-sourced notification carries
  // entityType as the enum NAME string. Mapped through mapNotification, it must still fetch the
  // parent and deep-link — NOT short-circuit to /notifications with no fetch.
  // TODO(008): see the imports above.
  // it('resolves a REST wire notification (entityType as name string) to the nested route', async () => {
  //   const wire: NotificationResponse = {
  //     id: 'n1',
  //     type: NotificationType.TaskAssigned,
  //     typeName: 'TaskAssigned',
  //     title: 'You were assigned a task',
  //     body: null,
  //     entityType: 'ProjectTask', // ← string name, exactly as the REST list serializes it
  //     entityId: 't1',
  //     createdAtUtc: '2026-07-08T09:00:00Z',
  //     readAtUtc: null,
  //   };
  //   expect(await resolver.resolve(mapNotification(wire))).toEqual([
  //     '/projects',
  //     'p1',
  //     'tasks',
  //     't1',
  //   ]);
  //   expect(tasks.getDetails).toHaveBeenCalledWith('t1');
  // });
});
