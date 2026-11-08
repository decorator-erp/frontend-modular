import { readField } from '@platform/http/api.service';
import {
  PortalShareKind,
  type PortalCounts,
  type PortalFile,
  type PortalOverview,
  type PortalPreview,
  type PortalProgress,
  type PortalSections,
  type PortalShare,
  type PortalStage,
  type PortalTask,
  type PortalUpdate,
  type PortalUpdateDraft,
} from '../model/portal.model';

/**
 * crmp P2-B: wire → model for the portal visibility responses (dms
 * `Crm.Contracts/Portal/PortalVisibilityContracts.cs`). Shared by the office service (shares,
 * updates, preview) and the client service (overview and the section lists): the preview is
 * built by the client routes' own code, so one normalizer reads both.
 */

const str = (o: unknown, key: string): string => readField<string>(o, key) ?? '';
const strOrNull = (o: unknown, key: string): string | null => readField<string>(o, key) ?? null;
const num = (o: unknown, key: string): number => Number(readField<number>(o, key) ?? 0) || 0;
const numOrNull = (o: unknown, key: string): number | null => {
  const v = readField<number | null>(o, key);
  return v === null || v === undefined ? null : Number(v);
};
const bool = (o: unknown, key: string): boolean => readField<boolean>(o, key) === true;
const list = (o: unknown, key: string): unknown[] => {
  const v = readField<unknown>(o, key);
  return Array.isArray(v) ? v : [];
};

/** An int, a numeric string or a member name → the kind; anything else → Document. */
export function toShareKind(raw: unknown): PortalShareKind {
  const values = Object.values(PortalShareKind) as number[];
  if (typeof raw === 'number' && values.includes(raw)) return raw as PortalShareKind;
  if (typeof raw === 'string') {
    if (/^\d+$/.test(raw)) return toShareKind(Number(raw));
    const hit = (Object.keys(PortalShareKind) as (keyof typeof PortalShareKind)[]).find(
      (k) => k.toLowerCase() === raw.toLowerCase(),
    );
    if (hit) return PortalShareKind[hit];
  }
  return PortalShareKind.Document;
}

export function normalizeSections(o: unknown): PortalSections {
  return {
    progress: bool(o, 'progress'),
    tasks: bool(o, 'tasks'),
    documents: bool(o, 'documents'),
    gallery: bool(o, 'gallery'),
    siteSurveys: bool(o, 'siteSurveys'),
    updates: bool(o, 'updates'),
  };
}

export function normalizeShare(o: unknown): PortalShare {
  return {
    id: str(o, 'id'),
    projectId: str(o, 'projectId'),
    itemKind: toShareKind(readField(o, 'itemKind')),
    itemId: str(o, 'itemId'),
    followLatest: bool(o, 'followLatest'),
    clientTitle: strOrNull(o, 'clientTitle'),
    clientNote: strOrNull(o, 'clientNote'),
    sortOrder: num(o, 'sortOrder'),
    sharedById: str(o, 'sharedById'),
    sharedAtUtc: str(o, 'sharedAtUtc'),
    // A missing flag reads as available: only an explicit `false` marks a vanished source.
    isAvailable: readField<boolean>(o, 'isAvailable') !== false,
    itemName: strOrNull(o, 'itemName'),
    contentType: strOrNull(o, 'contentType'),
    isImage: bool(o, 'isImage'),
    version: numOrNull(o, 'version'),
    stageName: strOrNull(o, 'stageName'),
    siteCode: strOrNull(o, 'siteCode'),
  };
}

export function normalizeUpdateDraft(o: unknown): PortalUpdateDraft {
  return {
    id: str(o, 'id'),
    projectId: str(o, 'projectId'),
    title: str(o, 'title'),
    body: str(o, 'body'),
    publishedAtUtc: strOrNull(o, 'publishedAtUtc'),
    authorId: str(o, 'authorId'),
    createdAtUtc: str(o, 'createdAtUtc'),
    shareIds: list(o, 'shareIds').map(String),
  };
}

function normalizeStage(o: unknown): PortalStage {
  return {
    name: str(o, 'name'),
    note: strOrNull(o, 'note'),
    order: num(o, 'order'),
    status: str(o, 'status'),
    plannedStartDate: strOrNull(o, 'plannedStartDate'),
    plannedEndDate: strOrNull(o, 'plannedEndDate'),
    actualStartDate: strOrNull(o, 'actualStartDate'),
    actualEndDate: strOrNull(o, 'actualEndDate'),
    progressPercentage: num(o, 'progressPercentage'),
  };
}

function normalizeProgress(o: unknown): PortalProgress | null {
  if (!o || typeof o !== 'object') return null;
  return {
    progressPercentage: num(o, 'progressPercentage'),
    activeStageName: strOrNull(o, 'activeStageName'),
    limitedToSharedStages: bool(o, 'limitedToSharedStages'),
    stages: list(o, 'stages')
      .map(normalizeStage)
      .sort((a, b) => a.order - b.order),
  };
}

function normalizeCounts(o: unknown): PortalCounts {
  return {
    documents: numOrNull(o, 'documents'),
    images: numOrNull(o, 'images'),
    sitePhotos: numOrNull(o, 'sitePhotos'),
    tasks: numOrNull(o, 'tasks'),
    updates: numOrNull(o, 'updates'),
  };
}

export function normalizeOverview(o: unknown): PortalOverview {
  return {
    projectId: str(o, 'projectId'),
    projectName: str(o, 'projectName'),
    sections: normalizeSections(readField(o, 'sections')),
    progress: normalizeProgress(readField(o, 'progress')),
    counts: normalizeCounts(readField(o, 'counts')),
  };
}

export function normalizeFile(o: unknown): PortalFile {
  return {
    shareId: str(o, 'shareId'),
    kind: toShareKind(readField(o, 'kind')),
    title: str(o, 'title'),
    note: strOrNull(o, 'note'),
    fileName: str(o, 'fileName'),
    contentType: str(o, 'contentType'),
    fileSizeBytes: num(o, 'fileSizeBytes'),
    isImage: bool(o, 'isImage'),
    sortOrder: num(o, 'sortOrder'),
    sharedAtUtc: str(o, 'sharedAtUtc'),
    url: str(o, 'url'),
  };
}

export function normalizeTask(o: unknown): PortalTask {
  return {
    shareId: str(o, 'shareId'),
    title: str(o, 'title'),
    note: strOrNull(o, 'note'),
    stageName: strOrNull(o, 'stageName'),
    status: str(o, 'status'),
    dueDate: strOrNull(o, 'dueDate'),
    startedAtUtc: strOrNull(o, 'startedAtUtc'),
    completedAtUtc: strOrNull(o, 'completedAtUtc'),
    sortOrder: num(o, 'sortOrder'),
  };
}

export function normalizeUpdate(o: unknown): PortalUpdate {
  return {
    id: str(o, 'id'),
    title: str(o, 'title'),
    body: str(o, 'body'),
    publishedAtUtc: str(o, 'publishedAtUtc'),
    attachments: list(o, 'attachments').map(normalizeFile),
  };
}

export function normalizePreview(o: unknown): PortalPreview {
  return {
    overview: normalizeOverview(readField(o, 'overview')),
    files: list(o, 'files').map(normalizeFile),
    gallery: list(o, 'gallery').map(normalizeFile),
    tasks: list(o, 'tasks').map(normalizeTask),
    updates: list(o, 'updates').map(normalizeUpdate),
  };
}
