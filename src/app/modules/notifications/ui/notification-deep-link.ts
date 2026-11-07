import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApprovalService } from '@modules/approvals';
import { CrmMeetingService } from '@modules/crm';
import { InvoiceService } from '@modules/finance';
import { VariationService } from '@modules/finance';
import { NotificationEntityType } from '../model/notification-enums';
import { NotificationView } from '../model/notification.model';

/** Router `navigate()` commands. */
export type RouteCommands = (string | number)[];

/** Where a notification with no reachable destination lands — never a dead link (SC-002). */
const FALLBACK: RouteCommands = ['/notifications'];

/**
 * Resolves a notification to a route via **fetch-on-click** (never during list rendering). Most
 * entities are nested under a project whose id is NOT in the notification payload, so the parent
 * `projectId` is fetched from the entity's own GET-by-id. Any failure (403/404/network), an entity
 * type with no screen, or a missing parent → graceful fallback to the notifications page (SC-002).
 *
 * Adding a future screen is a one-line `case`.
 */
@Injectable({ providedIn: 'root' })
export class NotificationDeepLink {
  private readonly invoices = inject(InvoiceService);
  private readonly variations = inject(VariationService);
  private readonly approvals = inject(ApprovalService);
  private readonly meetings = inject(CrmMeetingService);

  async resolve(view: NotificationView): Promise<RouteCommands> {
    const id = view.entityId;
    if (!id) {
      return FALLBACK;
    }
    try {
      switch (view.entityType) {
        case NotificationEntityType.Project:
          return ['/projects', id]; // single id — no fetch

        // crmp A-2 (BLOCKED): task and stage reads are nested under the project now
        // (`/projects/{projectId}/tasks/{taskId}`), and a notification carries only the entity id
        // (dms `Notifications.Contracts/NotificationContracts.cs:14`). The old `/project-tasks/{id}` and
        // `/project-stages/{id}` lookups no longer exist, so these fall back until the backend sends the
        // project id with the notification.
        case NotificationEntityType.ProjectTask:
        case NotificationEntityType.ProjectStage:
          return FALLBACK;

        case NotificationEntityType.Invoice: {
          const invoice = await firstValueFrom(this.invoices.getById(id));
          return invoice.projectId
            ? ['/finance', 'projects', invoice.projectId, 'invoices', id]
            : FALLBACK;
        }

        case NotificationEntityType.Variation: {
          const variation = await firstValueFrom(this.variations.getById(id));
          return variation.projectId
            ? ['/finance', 'projects', variation.projectId, 'variations', id]
            : FALLBACK;
        }

        case NotificationEntityType.Approval: {
          // The band that ACTUALLY carries CRM approval traffic (FR-039): the backend raises
          // every brief/item/gathering-entry approval notification as this generic entity type
          // (verified against the backend working tree) — the CRM-specific entity types below
          // (DesignBrief/RequirementItem/BriefSpace) are never used for these today. `subjectType`
          // routes to the entry's OWN screen instead of just the parent project.
          const pending = await firstValueFrom(this.approvals.listPending());
          const match = pending.find((p) => p.id === id || p.subjectId === id);
          if (!match?.projectId) return FALLBACK;
          return this.routeForCrmSubject(match.projectId, match.subjectType ?? null);
        }

        case NotificationEntityType.Meeting: {
          // Live and working: every CrmMeeting* notification (500–508) carries the meeting's own
          // id as entityId (verified against the backend working tree).
          const meeting = await firstValueFrom(this.meetings.getById(id));
          return meeting.projectId ? ['/crm/projects', meeting.projectId, 'scheduler'] : FALLBACK;
        }

        case NotificationEntityType.DesignBrief:
        case NotificationEntityType.RequirementItem:
        case NotificationEntityType.BriefSpace: {
          // ⚠️ Defensive, not currently exercised: today the backend always raises these three
          // subjects' approval notifications as the generic `Approval` entity type above, with
          // `entityId` = the APPROVAL's own id. If a future path ever raises one of these three
          // directly, `entityId` would be the SUBJECT's own id instead — matched here by
          // `subjectId`, not `id`, since that is what "direct" would mean.
          const pending = await firstValueFrom(this.approvals.listPending());
          const match = pending.find((p) => p.subjectId === id);
          if (!match?.projectId) return FALLBACK;
          return this.routeForCrmSubject(match.projectId, match.subjectType ?? null);
        }

        case NotificationEntityType.RequirementPeriod:
          // 🟡 Gap, not a bug: `entityId` is the period's own id (verified against the backend
          // working tree — CrmPeriodOpened/Extended/Closed all set it this way), and there is no
          // `GET /api/crm/periods/{id}` single-fetch endpoint to resolve its parent project from a
          // bare period id alone (only `GET /projects/{id}/periods`, a list). Falls back until
          // that endpoint exists — the same shape as this feature's other documented backend gaps.
          return FALLBACK;

        case NotificationEntityType.Lead:
          // No lead detail/list screen exists in this feature (crm.routes.ts has none) — falls
          // back by design, not an oversight.
          return FALLBACK;

        default:
          // No-screen types (GateCondition as a bare entity, Document) and any unknown value.
          return FALLBACK;
      }
    } catch {
      return FALLBACK; // 403/404/network → graceful fallback (still marked read by the caller)
    }
  }

  /**
   * Shared by the live `Approval` band and the defensive direct-entity-type cases: a `BriefSpace`
   * (a gathering entry) and `DesignBrief` land on the brief page; `RequirementItem` on its board;
   * anything else (`GateCondition`, unrecognized) lands on the parent project.
   */
  private routeForCrmSubject(projectId: string, subjectType: string | null): RouteCommands {
    switch (subjectType) {
      case 'DesignBrief':
      case 'BriefSpace':
        return ['/crm/projects', projectId, 'brief'];

      case 'RequirementItem':
        return ['/crm/projects', projectId, 'items'];

      default:
        return ['/projects', projectId];
    }
  }
}
