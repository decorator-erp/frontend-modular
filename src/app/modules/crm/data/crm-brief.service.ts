import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import { ApprovalState } from '../model/crm-enums';
import type {
  BriefHead,
  BriefHeadDiff,
  BriefHeadFieldChange,
  BriefSpace,
  BriefSpaceRequest,
  BriefView,
  CreateBriefRequest,
  CrmSpace,
  UpdateBriefHeadRequest,
} from '../model';
import { CrmSpaceService } from './crm-space.service';

/**
 * The brief — head (editable 1:1) and the append-only gathering ledger (`BriefSpace`
 * entries, each a thin wrapper referencing a real space or a general, project-wide entry).
 *
 * `crm.briefs.manage` on every mutation, `crm.briefs.read` on the office GET, `crm.portal` on
 * the client's own `getMyBrief`. T108 asked for one `CrmClientPortalService` folding
 * all ten `/api/crm/portal/*` endpoints — this repo's established precedent (T045's
 * meetings, T080's items, the existing `crm-approvals.service.ts`) is instead to fold
 * each portal variant into its OWN domain service, since it is the same domain object
 * on both sides of the gate. `getMyBrief` follows that precedent rather than adding a
 * fifth split; the new `crm-portal.service.ts` carries only the one truly new surface
 * (the client's own identity/contacts/projects, Dependency 13 — not yet on the wire).
 */
@Injectable({ providedIn: 'root' })
export class CrmBriefService extends ApiService {
  private readonly spacesApi = inject(CrmSpaceService);

  /**
   * `GET /api/crm/stages/{stageId}/brief` → `CrmDesignBriefResponse` — `crm.briefs.read` (009b #9).
   * One brief per stage; 404 `crm.briefs.NotFound` = unknown stage, out of scope, or no brief yet.
   */
  getBriefByStage(stageId: string): Observable<BriefHead> {
    return this.get<unknown>(`/crm/stages/${stageId}/brief`).pipe(
      map((r) => this.normalizeBrief(r)),
    );
  }

  /**
   * `POST /api/crm/projects/{projectId}/brief` `{ data, projectStageId }` → `201 { briefId }` —
   * `crm.briefs.manage` (009b #10). 403 `crm.access.NotAnEmployee` is the caller's to show
   * (`handled(403)`); 400 `UnitDetailsRequired`/`StageProjectMismatch`, 404 `ProjectNotFound`, 409
   * `AlreadyExists` come back as catalog codes.
   */
  createBrief(projectId: string, request: CreateBriefRequest): Observable<string> {
    return this.post<unknown>(
      `/crm/projects/${projectId}/brief`,
      { data: request.data, projectStageId: request.projectStageId },
      { context: handled(403) },
    ).pipe(map((r) => this.unwrapId(r, 'briefId')));
  }

  /**
   * `GET /api/crm/projects/{projectId}/brief` — **obsolete** (N-11): the project's most recently
   * created brief, same `CrmDesignBriefResponse`. Kept only as the fallback when no stage is chosen.
   */
  getBrief(projectId: string): Observable<BriefHead> {
    return this.get<unknown>(`/crm/projects/${projectId}/brief`).pipe(
      map((r) => this.normalizeBrief(r)),
    );
  }

  /**
   * `GET /api/crm/briefs/{briefId}/spaces` → `CrmBriefSpaceResponse[]` — `crm.briefs.read` (009b #11).
   * Newest first, superseded entries included (`isCurrent: false`). Each entry's `space` is resolved
   * from the project's spaces (inactive ones too); a failed spaces read leaves blank names.
   */
  listSpaces(briefId: string, projectId: string): Observable<BriefSpace[]> {
    return forkJoin([
      this.get<unknown>(`/crm/briefs/${briefId}/spaces`),
      this.spacesApi.list(projectId, true).pipe(catchError(() => of<CrmSpace[]>([]))),
    ]).pipe(
      map(([r, spaces]) => this.unwrapArray<unknown>(r).map((s) => this.normalizeSpace(s, spaces))),
    );
  }

  /**
   * `GET /api/crm/portal/projects/{projectId}/brief` — the client's own view, same
   * `BriefViewResponse` shape as the office GET. Gated `crm.portal`, not `crm.briefs.read`.
   */
  getMyBrief(projectId: string): Observable<BriefView> {
    return this.get<unknown>(`/crm/portal/projects/${projectId}/brief`).pipe(
      map((r) => this.normalizeBriefView(r)),
    );
  }

  /** `CrmDesignBriefResponse`: the top-level ids/status over the nested `head: CrmBriefHeadData`. */
  private normalizeBrief(r: unknown): BriefHead {
    const value = this.unwrap<Record<string, unknown>>(r);
    return {
      ...this.normalizeHead(this.field<unknown>(value, 'head') ?? {}),
      id: this.field<string>(value, 'id') ?? '',
      projectId: this.field<string>(value, 'projectId') ?? '',
      projectStageId: this.field<string | null>(value, 'projectStageId') ?? null,
      createdById: this.field<string>(value, 'createdById') ?? '',
      lastMeetingId: this.field<string | null>(value, 'lastMeetingId') ?? null,
      status: this.field<number>(value, 'status') ?? ApprovalState.Draft,
    };
  }

  private normalizeBriefView(r: unknown): BriefView {
    const value = this.unwrap<Record<string, unknown>>(r);
    return {
      head: this.normalizeHead(this.field<unknown>(value, 'head') ?? value),
      spaces: (this.field<unknown[]>(value, 'spaces') ?? []).map((s) => this.normalizeSpace(s)),
    };
  }

  /** `PUT /brief/head` → `204`. Editing returns the head to PendingApproval — the round does NOT move. */
  updateHead(projectId: string, request: UpdateBriefHeadRequest): Observable<void> {
    return this.put<void>(`/crm/projects/${projectId}/brief/head`, request);
  }

  /** `PUT /briefs/{briefId}/send-for-confirmation` → `204`. THIS is what advances the round. */
  sendForConfirmation(briefId: string): Observable<void> {
    return this.put<void>(`/crm/briefs/${briefId}/send-for-confirmation`, {});
  }

  /** `POST /briefs/{briefId}/spaces` → `201` with a bare `Guid`. Add a gathering entry. */
  addSpace(briefId: string, request: BriefSpaceRequest): Observable<string> {
    return this.post<unknown>(`/crm/briefs/${briefId}/spaces`, this.toSpaceBody(request)).pipe(
      map((r) => this.unwrap<string>(r)),
    );
  }

  /** `PUT /brief-spaces/{spaceId}` → `204`. A replace-all on selections; blocked once decided. */
  updateSpace(spaceId: string, request: BriefSpaceRequest): Observable<void> {
    return this.put<void>(`/crm/brief-spaces/${spaceId}`, this.toSpaceBody(request));
  }

  /** `PUT /brief-spaces/{spaceId}/send` → `204`. Sends the entry for the client's confirmation. */
  sendSpace(spaceId: string): Observable<void> {
    return this.put<void>(`/crm/brief-spaces/${spaceId}/send`, {});
  }

  /**
   * `POST /brief-spaces/{spaceId}/supersede` → `201` with a bare `Guid` — the NEW entry's id.
   * The server reports nothing about what carried over; the pre-fill and old→new mapping
   * are entirely client-derived (`supersede-mapper.ts`).
   */
  supersedeSpace(spaceId: string, request: BriefSpaceRequest): Observable<string> {
    return this.post<unknown>(
      `/crm/brief-spaces/${spaceId}/supersede`,
      this.toSpaceBody(request),
    ).pipe(map((r) => this.unwrap<string>(r)));
  }

  /**
   * `GET /briefs/{briefId}/rounds/{round}/diff` — permission `crm.portal`. Raw facts:
   * `field` is the exact PascalCase property name; values are bare-integer-string enums,
   * never prose. Round 1 → `previousRound: null`, empty `changes`.
   */
  getHeadDiff(briefId: string, round: number): Observable<BriefHeadDiff> {
    return this.get<unknown>(`/crm/briefs/${briefId}/rounds/${round}/diff`).pipe(
      map((r) => this.normalizeDiff(this.unwrap(r))),
    );
  }

  private toSpaceBody(request: BriefSpaceRequest): Record<string, unknown> {
    return {
      spaceId: request.spaceId ?? null,
      countOrPieces: request.countOrPieces ?? null,
      requirements: request.requirements ?? null,
      meetingId: request.meetingId ?? null,
      projectTaskId: request.projectTaskId ?? null,
    };
  }

  private normalizeHead(source: unknown): BriefHead {
    return {
      id: this.field<string>(source, 'id') ?? '',
      projectId: this.field<string>(source, 'projectId') ?? '',
      projectStageId: this.field<string | null>(source, 'projectStageId') ?? null,
      createdById: this.field<string>(source, 'createdById') ?? '',
      unitType: this.field<number>(source, 'unitType') ?? 1,
      unitCondition: this.field<number>(source, 'unitCondition') ?? 1,
      address: this.field<string | null>(source, 'address') ?? null,
      floorNo: this.field<number | null>(source, 'floorNo') ?? null,
      unitsPerFloor: this.field<number | null>(source, 'unitsPerFloor') ?? null,
      areaSqm: this.field<number | null>(source, 'areaSqm') ?? null,
      buildingKind: this.field<number | null>(source, 'buildingKind') ?? null,
      isLicensed: this.field<boolean | null>(source, 'isLicensed') ?? null,
      isRented: this.field<boolean | null>(source, 'isRented') ?? null,
      finishingPurpose: this.field<number | null>(source, 'finishingPurpose') ?? null,
      position: this.field<number | null>(source, 'position') ?? null,
      elevatorStatus: this.field<number | null>(source, 'elevatorStatus') ?? null,
      receivesFrequentVisitors:
        this.field<boolean | null>(source, 'receivesFrequentVisitors') ?? null,
      visitorsNote: this.field<string | null>(source, 'visitorsNote') ?? null,
      usedDesignerBefore: this.field<boolean | null>(source, 'usedDesignerBefore') ?? null,
      designerExperience: this.field<number | null>(source, 'designerExperience') ?? null,
      designerExperienceReason:
        this.field<string | null>(source, 'designerExperienceReason') ?? null,
      hiringReasons: this.field<number>(source, 'hiringReasons') ?? 0,
      preferredStyle: this.field<string | null>(source, 'preferredStyle') ?? null,
      preferredColors: this.field<string | null>(source, 'preferredColors') ?? null,
      furnitureStatus: this.field<number | null>(source, 'furnitureStatus') ?? null,
      expectedBudget: this.field<number | null>(source, 'expectedBudget') ?? null,
      timelinePressure: this.field<number | null>(source, 'timelinePressure') ?? null,
      architecturalRequests: this.field<string | null>(source, 'architecturalRequests') ?? null,
      otherNeeds: this.field<string | null>(source, 'otherNeeds') ?? null,
      sector: this.field<number | null>(source, 'sector') ?? null,
      status: this.field<number>(source, 'status') ?? ApprovalState.Draft,
      lastMeetingId: this.field<string | null>(source, 'lastMeetingId') ?? null,
    };
  }

  /**
   * An entry carries a flat `spaceId` (009b #11); `space` is resolved from `spaces` (an unknown id keeps
   * the id with blank names). A legacy nested `space` ref (the portal view) is still read when present.
   */
  private normalizeSpace(source: unknown, spaces: CrmSpace[] = []): BriefSpace {
    const spaceRef = this.field<unknown>(source, 'space');
    const refType = this.field<unknown>(spaceRef, 'spaceType');
    const spaceId =
      this.field<string | null>(source, 'spaceId') ?? this.field<string>(spaceRef, 'id') ?? null;
    const known = spaces.find((s) => s.id === spaceId);
    const space = spaceRef
      ? {
          id: this.field<string>(spaceRef, 'id') ?? '',
          name: this.field<string>(spaceRef, 'name') ?? '',
          spaceType: {
            id: this.field<string>(refType, 'id') ?? '',
            code: this.field<string>(refType, 'code') ?? '',
            nameEn: this.field<string>(refType, 'nameEn') ?? '',
            nameAr: this.field<string>(refType, 'nameAr') ?? '',
          },
        }
      : spaceId
        ? {
            id: spaceId,
            name: known?.name ?? '',
            spaceType: known?.spaceType ?? { id: '', code: '', nameEn: '', nameAr: '' },
          }
        : null;
    return {
      id: this.field<string>(source, 'id') ?? '',
      briefId: this.field<string>(source, 'briefId') ?? '',
      spaceId,
      space,
      countOrPieces: this.field<number | null>(source, 'countOrPieces') ?? null,
      requirements: this.field<string | null>(source, 'requirements') ?? null,
      meetingId: this.field<string | null>(source, 'meetingId') ?? null,
      approvalStatus: this.field<number>(source, 'approvalStatus') ?? ApprovalState.Draft,
      supersedesSpaceId: this.field<string | null>(source, 'supersedesSpaceId') ?? null,
      projectTaskId: this.field<string | null>(source, 'projectTaskId') ?? null,
      createdById: this.field<string>(source, 'createdById') ?? '',
      isCurrent: this.field<boolean>(source, 'isCurrent') ?? true,
    };
  }

  private normalizeDiff(source: unknown): BriefHeadDiff {
    return {
      briefId: this.field<string>(source, 'briefId') ?? '',
      round: this.field<number>(source, 'round') ?? 0,
      previousRound: this.field<number | null>(source, 'previousRound') ?? null,
      changes: (this.field<unknown[]>(source, 'changes') ?? []).map((c): BriefHeadFieldChange => ({
        field: this.field<string>(c, 'field') ?? '',
        previousValue: this.field<string | null>(c, 'previousValue') ?? null,
        currentValue: this.field<string | null>(c, 'currentValue') ?? null,
      })),
    };
  }
}
