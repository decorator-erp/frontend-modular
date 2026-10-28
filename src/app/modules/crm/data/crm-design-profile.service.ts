import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { ApprovalState, ContactRole, RequirementCategory } from '../model/crm-enums';
import type {
  ClientDesignProfile,
  DesignProfileAttachment,
  DesignProfileBriefHead,
  DesignProfileItem,
  DesignProfileSpace,
} from '../model';

/**
 * The designer's read-only view of a client + their unit (T120, FR-030). One GET,
 * gated `crm.design_profile.read`. **The server has already excluded money and
 * unconfirmed content** — see `ClientDesignProfile`'s docblock; this service only
 * normalizes the wire shape, never re-filters.
 */
@Injectable({ providedIn: 'root' })
export class CrmDesignProfileService extends ApiService {
  /** `GET /api/crm/projects/{projectId}/design-profile`. */
  getFor(projectId: string): Observable<ClientDesignProfile> {
    return this.get<unknown>(`/crm/projects/${projectId}/design-profile`).pipe(
      map((r) => this.normalize(this.unwrap(r))),
    );
  }

  private normalize(source: unknown): ClientDesignProfile {
    const client = this.field<unknown>(source, 'client');
    const primaryContact = this.field<unknown>(source, 'primaryContact');
    const briefHead = this.field<unknown>(source, 'briefHead');

    return {
      projectId: this.field<string>(source, 'projectId') ?? '',
      client: {
        clientId: this.field<string>(client, 'clientId') ?? '',
        fullName: this.field<string | null>(client, 'fullName') ?? null,
        jobTitle: this.field<string | null>(client, 'jobTitle') ?? null,
        maritalStatus: this.field<string | null>(client, 'maritalStatus') ?? null,
        address: this.field<string | null>(client, 'address') ?? null,
        children: (this.field<unknown[]>(client, 'children') ?? []).map((c) => ({
          gender: this.field<string>(c, 'gender') ?? '',
          age: this.field<number>(c, 'age') ?? 0,
        })),
      },
      primaryContact: primaryContact
        ? {
            id: this.field<string>(primaryContact, 'id') ?? '',
            firstName: this.field<string>(primaryContact, 'firstName') ?? '',
            lastName: this.field<string>(primaryContact, 'lastName') ?? '',
            email: this.field<string | null>(primaryContact, 'email') ?? null,
            phone: this.field<string | null>(primaryContact, 'phone') ?? null,
            mobile: this.field<string | null>(primaryContact, 'mobile') ?? null,
            role: this.field<number>(primaryContact, 'role') ?? ContactRole.Other,
          }
        : null,
      briefHead: briefHead ? this.normalizeBriefHead(briefHead) : null,
      spaces: (this.field<unknown[]>(source, 'spaces') ?? []).map((s) => this.normalizeSpace(s)),
      itemsByCategory: this.normalizeItemsByCategory(
        this.field<unknown>(source, 'itemsByCategory'),
      ),
      attachments: (this.field<unknown[]>(source, 'attachments') ?? []).map((a) =>
        this.normalizeAttachment(a),
      ),
    };
  }

  private normalizeBriefHead(source: unknown): DesignProfileBriefHead {
    return {
      id: this.field<string>(source, 'id') ?? '',
      unitType: this.field<number>(source, 'unitType') ?? 1,
      unitCondition: this.field<number>(source, 'unitCondition') ?? 1,
      address: this.field<string | null>(source, 'address') ?? null,
      floorNo: this.field<number | null>(source, 'floorNo') ?? null,
      unitsPerFloor: this.field<number | null>(source, 'unitsPerFloor') ?? null,
      areaSqm: this.field<number | null>(source, 'areaSqm') ?? null,
      buildingKind: this.field<number | null>(source, 'buildingKind') ?? null,
      isLicensed: this.field<boolean | null>(source, 'isLicensed') ?? null,
      position: this.field<number | null>(source, 'position') ?? null,
      elevatorStatus: this.field<number | null>(source, 'elevatorStatus') ?? null,
      utilityMetersNote: this.field<string | null>(source, 'utilityMetersNote') ?? null,
      receivesFrequentVisitors:
        this.field<boolean | null>(source, 'receivesFrequentVisitors') ?? null,
      visitorsNote: this.field<string | null>(source, 'visitorsNote') ?? null,
      parentsHobbies: this.field<string | null>(source, 'parentsHobbies') ?? null,
      childrenHobbies: this.field<string | null>(source, 'childrenHobbies') ?? null,
      hobbiesInDesign: this.field<boolean | null>(source, 'hobbiesInDesign') ?? null,
      usedDesignerBefore: this.field<boolean | null>(source, 'usedDesignerBefore') ?? null,
      designerExperience: this.field<number | null>(source, 'designerExperience') ?? null,
      designerExperienceReason:
        this.field<string | null>(source, 'designerExperienceReason') ?? null,
      hiringReasons: this.field<number>(source, 'hiringReasons') ?? 0,
      preferredStyle: this.field<string | null>(source, 'preferredStyle') ?? null,
      preferredColors: this.field<string | null>(source, 'preferredColors') ?? null,
      furnitureStatus: this.field<number | null>(source, 'furnitureStatus') ?? null,
      timelinePressure: this.field<number | null>(source, 'timelinePressure') ?? null,
      architecturalRequests: this.field<string | null>(source, 'architecturalRequests') ?? null,
      otherNeeds: this.field<string | null>(source, 'otherNeeds') ?? null,
      sector: this.field<number | null>(source, 'sector') ?? null,
      isRented: this.field<boolean | null>(source, 'isRented') ?? null,
      finishingPurpose: this.field<number | null>(source, 'finishingPurpose') ?? null,
    };
  }

  private normalizeSpace(source: unknown): DesignProfileSpace {
    const spaceRef = this.field<unknown>(source, 'space');
    const refType = this.field<unknown>(spaceRef, 'spaceType');
    return {
      id: this.field<string>(source, 'id') ?? '',
      space: spaceRef
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
        : null,
      countOrPieces: this.field<number | null>(source, 'countOrPieces') ?? null,
      requirements: this.field<string | null>(source, 'requirements') ?? null,
      meetingId: this.field<string | null>(source, 'meetingId') ?? null,
      projectTaskId: this.field<string | null>(source, 'projectTaskId') ?? null,
    };
  }

  private normalizeItem(source: unknown): DesignProfileItem {
    return {
      id: this.field<string>(source, 'id') ?? '',
      room: this.field<string | null>(source, 'room') ?? null,
      title: this.field<string>(source, 'title') ?? '',
      description: this.field<string | null>(source, 'description') ?? null,
      priority: this.field<number>(source, 'priority') ?? 0,
      approvalStatus: this.field<number>(source, 'approvalStatus') ?? ApprovalState.Approved,
      projectTaskId: this.field<string | null>(source, 'projectTaskId') ?? null,
    };
  }

  /** The wire is a JSON object keyed by the bare-integer STRING form of the enum. */
  private normalizeItemsByCategory(
    source: unknown,
  ): Partial<Record<RequirementCategory, DesignProfileItem[]>> {
    if (!source || typeof source !== 'object') return {};
    const result: Partial<Record<RequirementCategory, DesignProfileItem[]>> = {};
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      const category = Number(key) as RequirementCategory;
      if (Number.isNaN(category) || !Array.isArray(value)) continue;
      result[category] = value.map((i) => this.normalizeItem(i));
    }
    return result;
  }

  private normalizeAttachment(source: unknown): DesignProfileAttachment {
    return {
      linkId: this.field<string>(source, 'linkId') ?? '',
      documentId: this.field<string>(source, 'documentId') ?? '',
      fileName: this.field<string>(source, 'fileName') ?? '',
      contentType: this.field<string>(source, 'contentType') ?? '',
      fileSizeBytes: this.field<number>(source, 'fileSizeBytes') ?? 0,
      subjectKind:
        this.field<DesignProfileAttachment['subjectKind']>(source, 'subjectKind') ?? 'Meeting',
      subjectId: this.field<string>(source, 'subjectId') ?? '',
    };
  }
}
