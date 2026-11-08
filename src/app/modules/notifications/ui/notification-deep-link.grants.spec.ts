import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalService } from '@modules/approvals';
import { CrmMeetingService } from '@modules/crm';
import { InvoiceService, VariationService } from '@modules/finance';
import { AuthStore } from '@platform/auth/auth.store';
import { NotificationEntityType, NotificationType } from '../model/notification-enums';
import type { NotificationView } from '../model/notification.model';
import { NotificationDeepLink } from './notification-deep-link';

/**
 * crmp P1-B: access grant notifications (dms Notifications.Contracts/Enums.cs:59-61). The backend
 * raises them on the Project entity with the project's id (ProjectAccessGrantHandlers.cs:159-161).
 */
describe('NotificationDeepLink — access grants (crmp P1-B)', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        NotificationDeepLink,
        { provide: InvoiceService, useValue: {} },
        { provide: VariationService, useValue: {} },
        { provide: ApprovalService, useValue: {} },
        { provide: CrmMeetingService, useValue: {} },
        { provide: AuthStore, useValue: { isClient: vi.fn(() => false) } },
      ],
    });
    return TestBed.inject(NotificationDeepLink);
  }

  const view = (type: NotificationType): NotificationView => ({
    id: 'n1',
    type,
    typeName: 'x',
    title: 't',
    body: null,
    entityType: NotificationEntityType.Project,
    entityId: 'P1',
    projectId: 'P1',
    createdAtUtc: '2026-11-08T09:00:00Z',
    isUnread: true,
  });

  it('mirrors the backend ints: ProjectAccessGranted = 184, ProjectAccessRevoked = 185', () => {
    expect(NotificationType.ProjectAccessGranted).toBe(184);
    expect(NotificationType.ProjectAccessRevoked).toBe(185);
  });

  it('granted opens the project', async () => {
    expect(await setup().resolve(view(NotificationType.ProjectAccessGranted))).toEqual([
      '/projects',
      'P1',
    ]);
  });

  it('revoked opens Shared with me (the project is no longer reachable)', async () => {
    expect(await setup().resolve(view(NotificationType.ProjectAccessRevoked))).toEqual([
      '/projects',
      'shared-with-me',
    ]);
  });
});
