import { isProjectClosed, levelAtLeast, type Project } from '@modules/projects';
import { SiteStatus } from './site-enums';
import { SITE_PERM } from './site-permissions';

/** What the capabilities need to know about the survey's project (`ProjectAccessStore.project(id)()`). */
export type SiteProjectGate = Pick<Project, 'myLevel' | 'status' | 'isActive'>;

export interface SiteCaps {
  /** The project is inactive, OnHold, Completed or Cancelled (U4). */
  closed: boolean;
  /** Unit data, capture grid and documents (Editor, Draft/Rejected, open; `sites.update`). */
  edit: boolean;
  /** Draft → Submitted (Editor, open; `sites.submit`). */
  submit: boolean;
  /** Approve/Reject are offered (Manager, Submitted; `sites.approve`; allowed on a closed project). */
  decide: boolean;
  /** Approve itself: `decide` and not the caller's own survey (U5) unless `project.read_all`. */
  approve: boolean;
  /** `decide` holds but Approve is hidden because the caller created the survey (shows why). */
  selfApproval: boolean;
  /** Rejected → Draft (Manager, open; `sites.update`). */
  reopen: boolean;
  /** Soft delete (Manager, Draft/Rejected, open; `sites.delete`). */
  del: boolean;
}

const NONE: SiteCaps = {
  closed: false,
  edit: false,
  submit: false,
  decide: false,
  approve: false,
  selfApproval: false,
  reopen: false,
  del: false,
};

/**
 * sites S-1 (U3–U5): every action needs the claim AND the caller's project level AND the survey state
 * AND (except deciding a Submitted survey) an open project (prototype `caps()`, `sites.js:192-202`;
 * server order `SiteScopeDecorator.cs:60-92`). A project not loaded yet allows nothing.
 *
 * Self-approval (DEVIATION-S1, BF-2): Approve is hidden when the caller's employee id equals `createdById`
 * OR `submittedById` and the caller lacks `project.read_all` — the same two people the backend refuses
 * (`SiteCommandHandlers.cs:243`). The handled 403 `sites.SelfApprovalNotAllowed` stays as the fallback.
 */
export function siteCaps(
  site: { status: number; createdById: string; submittedById?: string | null } | null,
  project: SiteProjectGate | null,
  can: (perm: string) => boolean,
  me: string | null,
): SiteCaps {
  if (!site || !project) return NONE;
  const closed = isProjectClosed(project);
  const editor = levelAtLeast(project.myLevel, 'Editor');
  const manager = levelAtLeast(project.myLevel, 'Manager');
  const editable = site.status === SiteStatus.Draft || site.status === SiteStatus.Rejected;
  const decide = can(SITE_PERM.approve) && manager && site.status === SiteStatus.Submitted;
  const self =
    !!me &&
    (site.createdById === me || site.submittedById === me) &&
    !can(SITE_PERM.projectReadAll);
  return {
    closed,
    edit: can(SITE_PERM.update) && editor && editable && !closed,
    submit: can(SITE_PERM.submit) && editor && site.status === SiteStatus.Draft && !closed,
    decide,
    approve: decide && !self,
    selfApproval: decide && self,
    reopen: can(SITE_PERM.update) && manager && site.status === SiteStatus.Rejected && !closed,
    del: can(SITE_PERM.delete) && manager && editable && !closed,
  };
}

/** S-2: "New survey" on a project — `sites.create`, Editor+ and an open project. */
export function canCreateSurvey(
  project: SiteProjectGate | null,
  can: (perm: string) => boolean,
): boolean {
  if (!project) return false;
  return (
    can(SITE_PERM.create) && levelAtLeast(project.myLevel, 'Editor') && !isProjectClosed(project)
  );
}
