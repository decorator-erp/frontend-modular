import { NotificationEntityType, NotificationType } from './notification-enums';
import { mapNotification, NotificationResponse } from './notification.model';

function dto(overrides: Partial<NotificationResponse> = {}): NotificationResponse {
  return {
    id: 'n1',
    type: NotificationType.TaskAssigned,
    typeName: 'TaskAssigned',
    title: 'You were assigned a task',
    body: 'Review the drawings',
    entityType: NotificationEntityType.ProjectTask,
    entityId: 't-123',
    createdAtUtc: '2026-07-08T09:12:44Z',
    readAtUtc: null,
    ...overrides,
  };
}

describe('mapNotification', () => {
  it('maps every field and coerces the int enums', () => {
    const v = mapNotification(dto());
    expect(v.id).toBe('n1');
    expect(v.type).toBe(NotificationType.TaskAssigned);
    expect(v.typeName).toBe('TaskAssigned');
    expect(v.title).toBe('You were assigned a task');
    expect(v.body).toBe('Review the drawings');
    expect(v.entityType).toBe(NotificationEntityType.ProjectTask);
    expect(v.entityId).toBe('t-123');
    expect(v.createdAtUtc).toBe('2026-07-08T09:12:44Z');
  });

  it('derives isUnread=true when readAtUtc is null', () => {
    expect(mapNotification(dto({ readAtUtc: null })).isUnread).toBe(true);
  });

  it('derives isUnread=true when readAtUtc is absent', () => {
    const d = dto();
    delete d.readAtUtc;
    expect(mapNotification(d).isUnread).toBe(true);
  });

  it('derives isUnread=false when readAtUtc is set', () => {
    expect(mapNotification(dto({ readAtUtc: '2026-07-08T10:00:00Z' })).isUnread).toBe(false);
  });

  it('normalizes optional body/entity fields to null when absent', () => {
    const v = mapNotification(dto({ body: undefined, entityType: null, entityId: undefined }));
    expect(v.body).toBeNull();
    expect(v.entityType).toBeNull();
    expect(v.entityId).toBeNull();
  });

  // crmp A-2: the parent project comes on both the REST read and the SignalR push.
  it('maps projectId when the wire carries it', () => {
    expect(mapNotification(dto({ projectId: 'p-9' })).projectId).toBe('p-9');
  });

  it('normalizes a null or absent projectId to null', () => {
    expect(mapNotification(dto({ projectId: null })).projectId).toBeNull();
    expect(mapNotification(dto()).projectId).toBeNull();
  });

  // Regression: the wire is inconsistent — the REST list sends entityType as the enum NAME
  // string ("ProjectTask"), the SignalR push sends the raw int (5). Both must land on the enum,
  // else the deep-link resolver's numeric switch never matches → wrong /notifications fallback.
  it('coerces the REST name-string entityType onto the numeric enum ("ProjectTask" → 5)', () => {
    expect(mapNotification(dto({ entityType: 'ProjectTask' })).entityType).toBe(
      NotificationEntityType.ProjectTask,
    );
    expect(mapNotification(dto({ entityType: 'Invoice' })).entityType).toBe(
      NotificationEntityType.Invoice,
    );
  });

  it('accepts the SignalR push int entityType (5 → ProjectTask) and a numeric string ("10")', () => {
    expect(mapNotification(dto({ entityType: 5 })).entityType).toBe(
      NotificationEntityType.ProjectTask,
    );
    expect(mapNotification(dto({ entityType: '10' })).entityType).toBe(
      NotificationEntityType.Invoice,
    );
  });

  it('maps an unknown name or out-of-range int to null (→ resolver fallback)', () => {
    expect(mapNotification(dto({ entityType: 'Nope' })).entityType).toBeNull();
    expect(mapNotification(dto({ entityType: 99 })).entityType).toBeNull();
    expect(mapNotification(dto({ entityType: '' })).entityType).toBeNull();
  });

  it('defaults typeName to "" when the push omits it', () => {
    const d = dto();
    delete d.typeName;
    expect(mapNotification(d).typeName).toBe('');
  });
});
