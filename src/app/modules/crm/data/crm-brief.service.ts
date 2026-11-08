import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { normalizeSpaceSelections } from './crm-storefront.service';
import { handled } from '@platform/http/handled-errors';
import { ApprovalState } from '../model/crm-enums';
import type {
  BriefHead,
  BriefHeadDiff,
  BriefHeadFieldChange,
  BriefRound,
  BriefSpace,
  BriefSpaceRequest,
  CreateBriefRequest,
  CrmSpace,
  PortalBriefHead,
  PortalBriefView,
  UpdateBriefHeadRequest,
} from '../model';
import { CrmSpaceService } from './crm-space.service';

/**
 * The brief — head (editable 1:1) and the append-only gathering ledger (`BriefSpace`
 * entries, each a thin wrapper referencing a real space or a general, project-wide entry).
 *
 * `crm.briefs.manage` on every mutation, `crm.briefs.read` on the office GET, `crm.briefs.view_own`
 * on the client's own `getMyBrief` (009b #43). T108 asked for one `CrmClientPortalService` folding
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
   * `GET /api/crm/portal/projects/{projectId}/brief[?stageId]` → `PortalBriefViewResponse` —
   * `crm.briefs.view_own` (009b #43). Its own shape, read by its own normalizer: a `null` head until the
   * first send. 404 `crm.portal.NotFound` and 403 `crm.portal.NotAClient` / `crm.access.NoStanding` are
   * the caller's to show (`handled(403, 404)`).
   */
  getMyBrief(projectId: string, stageId: string | null = null): Observable<PortalBriefView> {
    return this.get<unknown>(
      `/crm/portal/projects/${projectId}/brief`,
      stageId ? { stageId } : undefined,
      { context: handled(403, 404) },
    ).pipe(map((r) => this.normalizePortalBriefView(r)));
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

  /** `PortalBriefViewResponse` (009b #43): a nullable `BriefHeadBlock` keyed `briefId`, with a `round`. */
  private normalizePortalBriefView(r: unknown): PortalBriefView {
    const value = this.unwrap<Record<string, unknown>>(r);
    const head = this.field<unknown>(value, 'head') ?? null;
    return {
      head: head ? this.normalizePortalHead(head) : null,
      spaces: (this.field<unknown[]>(value, 'spaces') ?? []).map((s) => this.normalizeSpace(s)),
    };
  }

  private normalizePortalHead(source: unknown): PortalBriefHead {
    return {
      ...this.normalizeHead(source),
      id: this.field<string>(source, 'briefId') ?? '',
      createdById: '',
      expectedBudget: null,
      lastMeetingId: null,
      round: this.field<number>(source, 'round') ?? 0,
    };
  }

  /**
   * `PUT /api/crm/briefs/{briefId}/head` `{ data, lastMeetingId }` → `204` — `crm.briefs.manage`
   * (009b #12). Editing never moves the round; only `sendForConfirmation()` does. Validation keys
   * arrive as `Data.<Field>`.
   */
  updateHead(briefId: string, request: UpdateBriefHeadRequest): Observable<void> {
    return this.put<void>(`/crm/briefs/${briefId}/head`, {
      data: request.data,
      lastMeetingId: request.lastMeetingId ?? null,
    });
  }

  /**
   * `PUT /api/crm/briefs/{briefId}/send` → `204` — `crm.briefs.send` (009b #13); it binds no body. THIS is
   * what advances the round: it opens round n+1.
   */
  sendForConfirmation(briefId: string): Observable<void> {
    return this.put<void>(`/crm/briefs/${briefId}/send`, {});
  }

  /** `POST /briefs/{briefId}/spaces` → `201 { briefSpaceId }` (009b #15). Add a gathering entry. */
  addSpace(briefId: string, request: BriefSpaceRequest): Observable<string> {
    // FINDING-5-7: the caller shows the 403's catalog message (`friendly()`).
    return this.post<unknown>(`/crm/briefs/${briefId}/spaces`, this.toSpaceBody(request), {
      context: handled(403),
    }).pipe(map((r) => this.unwrapId(r, 'briefSpaceId')));
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
   * `POST /brief-spaces/{spaceId}/supersede` → `201 { briefSpaceId }` — the NEW entry's id (009b #15).
   * Only an Approved entry, only once (409 `OnlyLockedSuperseded` / `AlreadySuperseded`), and the
   * body must repeat the original's `spaceId` (400 `SupersedeSpaceMismatch`). The server reports
   * nothing about what carried over; the pre-fill is client-derived.
   */
  supersedeSpace(spaceId: string, request: BriefSpaceRequest): Observable<string> {
    return this.post<unknown>(
      `/crm/brief-spaces/${spaceId}/supersede`,
      this.toSpaceBody(request),
      { context: handled(403) }, // FINDING-5-7: the modal shows the 403's catalog message.
    ).pipe(map((r) => this.unwrapId(r, 'briefSpaceId')));
  }

  /**
   * `GET /briefs/{briefId}/rounds/{round}/diff` — two audiences on one route: `crm.briefs.read` is
   * the office, else `crm.briefs.view_own` is the client (own projects, no budget); neither is 403
   * (`CrmBriefEndpoints.cs:148-176`). Raw facts: `field` is the exact PascalCase property name;
   * values are bare-integer-string enums, never prose. Round 1 → `previousRound: null`, and
   * `changes` lists every set field with a `null` previous value (`CrmBriefHeadSnapshot.DiffFrom`).
   */
  getHeadDiff(briefId: string, round: number): Observable<BriefHeadDiff> {
    return this.get<unknown>(`/crm/briefs/${briefId}/rounds/${round}/diff`).pipe(
      map((r) => this.normalizeDiff(this.unwrap(r))),
    );
  }

  /**
   * `GET /api/crm/briefs/{briefId}/rounds` → `CrmBriefRoundResponse[]` — `crm.briefs.read` (009b #14).
   * Round order, Voided rounds included; the last entry is the head's current round.
   */
  listRounds(briefId: string): Observable<BriefRound[]> {
    return this.get<unknown>(`/crm/briefs/${briefId}/rounds`).pipe(
      map((r) =>
        this.unwrapArray<unknown>(r).map((x) => ({
          round: this.field<number>(x, 'round') ?? 0,
          sentAtUtc: this.field<string>(x, 'sentAtUtc') ?? '',
          outcome: this.field<number>(x, 'outcome') ?? 0,
          decidedAtUtc: this.field<string | null>(x, 'decidedAtUtc') ?? null,
        })),
      ),
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
      // crmp C-6: the frozen storefront picks (#34 office, #84 portal; same shape as #110).
      selections: normalizeSpaceSelections(this.field<unknown>(source, 'selections')),
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
