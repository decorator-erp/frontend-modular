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

// Future: dashboard (010).
export { StageGateConditionService } from './data/stage-gate-condition.service';
export { TaskGateConditionService } from './data/task-gate-condition.service';
