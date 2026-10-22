// The audit and activity slice of the old `core/models/index.ts` at SOURCE_SHA (spec 005):
// lines 205–276, byte-for-byte. (`core/models/audit.model.ts` is dead — charter §5.)

export interface AuditLogResponse {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  ipAddress: string | null;
  action: string;
  entityName: string;
  entityId: string | null;
  module: string | null;
  description: string | null;
  outcome: string;
  failureReason: string | null;
  oldValues: string | null;
  newValues: string | null;
  changedColumns: string | null;
  requestPath: string | null;
  requestMethod: string | null;
  durationMs: number | null;
  timestamp: string;
}
export interface AuditPagedResult {
  items: AuditLogResponse[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
export interface AuditQueryParams {
  page?: number;
  pageSize?: number;
  desc?: boolean;
  userId?: string;
  entityName?: string;
  entityId?: string;
  action?: string;
  module?: string;
  from?: string;
  to?: string;
}

// Activity feed - per-entity timeline and per-project feed.
// Smaller / derived shape than AuditLogResponse; UI-friendly fields only.
export interface ActivityResponse {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  action: string;
  entityName: string;
  entityId: string | null;
  entityDisplayName: string | null;
  projectId: string | null;
  message: string;
  /** ISO datetime. */
  occurredAt: string;
}
export interface ActivityPagedResult {
  items: ActivityResponse[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
export interface ActivityQueryParams {
  page?: number;
  pageSize?: number;
  projectId?: string;
  userId?: string;
  from?: string;
  to?: string;
  action?: string;
}
