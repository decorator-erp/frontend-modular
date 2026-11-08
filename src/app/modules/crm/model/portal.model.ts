/**
 * crmp P2-B: the client portal visibility shapes (dms `Crm.Contracts/Portal/PortalVisibilityContracts.cs`).
 * Enums arrive as bare integers; `status` on a stage or task is a Projects status NAME.
 */

/** `PortalShareKind` (`Crm.Contracts/Enums.cs:304-311`). */
export const PortalShareKind = {
  Document: 1,
  Image: 2,
  SitePhoto: 3,
  Stage: 4,
  Task: 5,
} as const;
export type PortalShareKind = (typeof PortalShareKind)[keyof typeof PortalShareKind];

export const PORTAL_SHARE_KINDS: readonly PortalShareKind[] = [
  PortalShareKind.Document,
  PortalShareKind.Image,
  PortalShareKind.SitePhoto,
  PortalShareKind.Stage,
  PortalShareKind.Task,
];

/** Kinds an update may attach (`CreateCrmPortalUpdateCommand`: Document, Image or SitePhoto shares). */
export const PORTAL_FILE_KINDS: readonly PortalShareKind[] = [
  PortalShareKind.Document,
  PortalShareKind.Image,
  PortalShareKind.SitePhoto,
];

/** Kinds whose share carries "follow the latest version" (documents and images). */
export function followsLatest(kind: PortalShareKind): boolean {
  return kind === PortalShareKind.Document || kind === PortalShareKind.Image;
}

/** The six section switches (`PortalSectionsResponse`, `PortalSettingsRequest`). */
export interface PortalSections {
  progress: boolean;
  tasks: boolean;
  documents: boolean;
  gallery: boolean;
  siteSurveys: boolean;
  updates: boolean;
}

export type PortalSectionKey = keyof PortalSections;

export const PORTAL_SECTION_KEYS: readonly PortalSectionKey[] = [
  'progress',
  'tasks',
  'documents',
  'gallery',
  'siteSurveys',
  'updates',
];

/** `CrmPortalSettingsResponse`. */
export interface PortalSettings extends PortalSections {
  projectId: string;
}

/** `CrmPortalShareResponse`. */
export interface PortalShare {
  id: string;
  projectId: string;
  itemKind: PortalShareKind;
  itemId: string;
  followLatest: boolean;
  clientTitle: string | null;
  clientNote: string | null;
  sortOrder: number;
  sharedById: string;
  sharedAtUtc: string;
  isAvailable: boolean;
  itemName: string | null;
  contentType: string | null;
  isImage: boolean;
  version: number | null;
  stageName: string | null;
  siteCode: string | null;
}

/** `CreateShareRequest`. */
export interface CreatePortalShareRequest {
  itemKind: PortalShareKind;
  itemId: string;
  clientTitle?: string | null;
  clientNote?: string | null;
  followLatest?: boolean;
  sortOrder?: number | null;
  notifyClient?: boolean;
}

/** `UpdateShareRequest`. */
export interface UpdatePortalShareRequest {
  clientTitle: string | null;
  clientNote: string | null;
  followLatest?: boolean;
}

/** `CrmPortalUpdateResponse` (office: drafts included). */
export interface PortalUpdateDraft {
  id: string;
  projectId: string;
  title: string;
  body: string;
  publishedAtUtc: string | null;
  authorId: string;
  createdAtUtc: string;
  shareIds: string[];
}

/** `UpdateRequest` (create and edit). */
export interface PortalUpdateRequest {
  title: string;
  body?: string | null;
  shareIds?: string[];
}

// ── What the client sees ──────────────────────────────────────────────────────

/** `PortalStageResponse`. */
export interface PortalStage {
  name: string;
  note: string | null;
  order: number;
  status: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  progressPercentage: number;
}

/** `PortalProgressResponse`. */
export interface PortalProgress {
  progressPercentage: number;
  activeStageName: string | null;
  limitedToSharedStages: boolean;
  stages: PortalStage[];
}

/** `PortalSectionCountsResponse`: null for a section that is off. */
export interface PortalCounts {
  documents: number | null;
  images: number | null;
  sitePhotos: number | null;
  tasks: number | null;
  updates: number | null;
}

/** `PortalOverviewResponse`. */
export interface PortalOverview {
  projectId: string;
  projectName: string;
  sections: PortalSections;
  progress: PortalProgress | null;
  counts: PortalCounts;
}

/** `PortalFileResponse`: a shared document, image or site photo. */
export interface PortalFile {
  shareId: string;
  kind: PortalShareKind;
  title: string;
  note: string | null;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  isImage: boolean;
  sortOrder: number;
  sharedAtUtc: string;
  url: string;
}

/** `PortalTaskResponse`. */
export interface PortalTask {
  shareId: string;
  title: string;
  note: string | null;
  stageName: string | null;
  status: string;
  dueDate: string | null;
  startedAtUtc: string | null;
  completedAtUtc: string | null;
  sortOrder: number;
}

/** `PortalUpdateResponse` (published only). */
export interface PortalUpdate {
  id: string;
  title: string;
  body: string;
  publishedAtUtc: string;
  attachments: PortalFile[];
}

/** `CrmPortalPreviewResponse`: exactly what the client would see. */
export interface PortalPreview {
  overview: PortalOverview;
  files: PortalFile[];
  gallery: PortalFile[];
  tasks: PortalTask[];
  updates: PortalUpdate[];
}
