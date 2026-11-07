import { EMPTY_UNIT_DATA, type SiteDetail } from '../model/site.model';

/** Test fixtures shared by the sites specs (imported by specs only). */
export function detail(patch: Partial<SiteDetail> = {}): SiteDetail {
  return {
    ...EMPTY_UNIT_DATA,
    id: 'S1',
    projectId: 'P',
    code: 'SITE-00001',
    status: 1,
    createdById: 'E-creator',
    submittedAtUtc: null,
    decidedAtUtc: null,
    decidedById: null,
    decisionNote: null,
    isActive: true,
    createdAtUtc: '2026-11-01T08:00:00Z',
    recordCounts: [],
    ...patch,
  };
}
