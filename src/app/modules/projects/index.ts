// The projects barrel: only what a foreign consumer needs (charter §3; spec 008). Each export names
// its consumer. The consumers come from the old app at SOURCE_SHA, listed in reports/008-report.md.

// app.routes.ts (the office shell's projects children). Routed pages are NOT exported: a barrel
// export would pull the page into the initial bundle through app.routes.ts.
export { projectsRoutes } from './projects.routes';

// finance (boq-generate, budget-line-form, invoice-form, ledger-post, variation-raise);
// notifications (notification-deep-link: the ProjectTask and ProjectStage cases).
export { ProjectStageService } from './data/project-stage.service';
export { ProjectTaskService } from './data/project-task.service';

// layouts (app-shell palette-sources: ProjectsCommandSource).
export { ProjectSearchService } from './data/project-search.service';
export type { ProjectWithCode } from './data/project-search.service';

// Future: crm (009) — brief page, dashboard, scheduler, client hub, meetings rail, quick create;
// dashboard (010).
export { ProjectService } from './data/project.service';
export type { CreateProjectRequest, Project } from './model/project.model';

// Future: crm (009) — brief attachments.
export { DocumentFoldersService, ProjectDocumentsService } from './data/documents.service';
export type { ProjectDocument } from './data/documents.service';

// crmp C-7: crm artifact unlink compares the link's author with the caller's employee id (`me()`).
export { ProjectAccessStore } from './stores/project-access.store';

// layouts (sidebar): the "Shared with me" nav entry shows only when the caller has grants (crmp P1-B).
export { MyAccessGrantsStore } from './stores/my-access-grants.store';

// sites (NEW-FEATURE-1): survey capabilities compare the caller's project level and the project's
// liveness (site-capabilities.ts, the list's create gate).
export { isProjectClosed, levelAtLeast, toProjectLevel } from './model/project-actions';
export type { ProjectLevel } from './model/project-actions';

// sites (crmp P1-B): survey capabilities, the list's project filter and the survey documents read a
// grantee's claims from the grant (the token does not carry them).
export { claimCheck, grantCovers } from './model/project-access';
export type { AccessArea, ProjectAccess } from './model/access-grant.model';

// Future: dashboard (010).
export { StageGateConditionService } from './data/stage-gate-condition.service';
export { TaskGateConditionService } from './data/task-gate-condition.service';
