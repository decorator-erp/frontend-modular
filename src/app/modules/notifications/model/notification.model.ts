import { NotificationEntityType, NotificationType } from './notification-enums';

/**
 * Wire DTO for a notification — identical shape from the REST list endpoint and the SignalR
 * hub's `ReceiveNotification` push. Enums arrive as ints (`type`, `entityType`).
 */
export interface NotificationResponse {
  id: string;
  type: number;
  /**
   * Server-provided display label — render this, don't map the enum to text client-side.
   * Present on the REST list; **omitted by the SignalR push** (which carries `title`/`body`).
   */
  typeName?: string;
  title: string;
  body?: string | null;
  /**
   * Deep-link target. The wire is inconsistent (verified against the backend): the REST list
   * sends the enum **name** string (`"ProjectTask"`, via `.ToString()`), while the SignalR push
   * sends the raw **int** (`5`). `mapNotification` coerces both onto {@link NotificationEntityType}.
   */
  entityType?: string | number | null;
  entityId?: string | null;
  /**
   * The entity's parent project, for screens nested under one (ProjectTask, ProjectStage). Sent on
   * the REST list and the SignalR push (dms `NotificationResponse.ProjectId`). Null when the entity is
   * not project-scoped or the notification predates the field.
   */
  projectId?: string | null;
  /** ISO-8601 UTC. */
  createdAtUtc: string;
  /** ISO-8601 UTC when read; null/absent ⇒ unread. The SignalR push omits it (a push is unread). */
  readAtUtc?: string | null;
}

/** Client view model the UI binds to. `isUnread` is the single source for the unread cue. */
export interface NotificationView {
  id: string;
  type: NotificationType;
  typeName: string;
  title: string;
  body: string | null;
  entityType: NotificationEntityType | null;
  entityId: string | null;
  projectId: string | null;
  createdAtUtc: string;
  isUnread: boolean;
}

/**
 * Coerce the wire `entityType` onto {@link NotificationEntityType}. The REST list sends the enum
 * **name** (`"ProjectTask"`); the SignalR push sends the raw **int** (`5`). Accept both; anything
 * unrecognized (unknown name, out-of-range int, absent) → `null`, which the deep-link resolver
 * treats as a no-destination fallback. Backend and frontend enum members are identical by name.
 */
function coerceEntityType(raw: string | number | null | undefined): NotificationEntityType | null {
  if (raw == null) return null;
  if (typeof raw === 'number' || /^\d+$/.test(raw)) {
    const n = Number(raw);
    return n in NotificationEntityType ? (n as NotificationEntityType) : null;
  }
  const byName = (NotificationEntityType as Record<string, unknown>)[raw];
  return typeof byName === 'number' ? (byName as NotificationEntityType) : null;
}

/** Pure DTO → view mapping. Normalizes the wire's int/name enum fields and derives `isUnread`. */
export function mapNotification(dto: NotificationResponse): NotificationView {
  return {
    id: dto.id,
    type: dto.type as NotificationType,
    typeName: dto.typeName ?? '',
    title: dto.title,
    body: dto.body ?? null,
    entityType: coerceEntityType(dto.entityType),
    entityId: dto.entityId ?? null,
    projectId: dto.projectId ?? null,
    createdAtUtc: dto.createdAtUtc,
    isUnread: !dto.readAtUtc,
  };
}
