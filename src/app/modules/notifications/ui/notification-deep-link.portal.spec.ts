import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalService } from '@modules/approvals';
import { CrmMeetingService } from '@modules/crm';
import { InvoiceService, VariationService } from '@modules/finance';
import { AuthStore } from '@platform/auth/auth.store';
import { NotificationEntityType, NotificationType } from '../model/notification-enums';
import type { NotificationView } from '../model/notification.model';
import { NotificationDeepLink } from './notification-deep-link';

/** crmp P2-B: the client portal notifications (dms `Notifications.Contracts/Enums.cs:91-92`). */
describe('NotificationDeepLink — client portal notifications (crmp P2-B)', () => {
  function setup(isClient: boolean) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        NotificationDeepLink,
        { provide: InvoiceService, useValue: {} },
        { provide: VariationService, useValue: {} },
        { provide: ApprovalService, useValue: {} },
        { provide: CrmMeetingService, useValue: {} },
        { provide: AuthStore, useValue: { isClient: vi.fn(() => isClient) } },
      ],
    });
    return { resolver: TestBed.inject(NotificationDeepLink), router: TestBed.inject(Router) };
  }

  const view = (type: NotificationType): NotificationView => ({
    id: 'n1',
    type,
    typeName: 'x',
    title: 't',
    body: null,
    entityType: NotificationEntityType.Project,
    entityId: 'P1',
    projectId: null,
    createdAtUtc: '2026-11-08T09:00:00Z',
    isUnread: true,
  });

  it('mirrors the backend ints: CrmPortalItemShared = 540, CrmPortalUpdatePosted = 541', () => {
    expect(NotificationType.CrmPortalItemShared).toBe(540);
    expect(NotificationType.CrmPortalUpdatePosted).toBe(541);
  });

  it('a client opens an item-shared notification on that project in the portal', async () => {
    const { resolver, router } = setup(true);
    const target = await resolver.resolve(view(NotificationType.CrmPortalItemShared));
    expect(target).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(target as UrlTree)).toBe('/portal?projectId=P1');
  });

  it('a client opens an update-posted notification on the Updates tab', async () => {
    const { resolver, router } = setup(true);
    const target = await resolver.resolve(view(NotificationType.CrmPortalUpdatePosted));
    expect(router.serializeUrl(target as UrlTree)).toBe('/portal?projectId=P1&tab=updates');
  });

  it('an office user keeps the project page for a project notification', async () => {
    const { resolver } = setup(false);
    expect(await resolver.resolve(view(NotificationType.CrmPortalUpdatePosted))).toEqual([
      '/projects',
      'P1',
    ]);
  });

  it('other project notifications keep the project page for a client too', async () => {
    const { resolver } = setup(true);
    expect(await resolver.resolve(view(NotificationType.TaskAssigned))).toEqual([
      '/projects',
      'P1',
    ]);
  });
});
