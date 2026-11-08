// The library barrel: only what a foreign consumer needs (charter §3; spec 005). Each export names
// its consumer. Future consumers, from the old app at SOURCE_SHA, are listed in reports/005-report.md.

// app.routes.ts (the office shell's children).
export { libraryRoutes } from './library.routes';

// Future: projects (project-create).
export { StageTemplatesService } from './data/stage-templates.service';

// Projects scope of work (specs/sow-scope-of-work.md): the stage picker's template stages
// (defaultFee / taskCount). 008b #10.
export type { TemplateStage } from './model/stage-template.model';

// Sync F3: projects (task page "Apply template").
export { FileTemplatesService } from './data/file-templates.service';
export type { FileTemplate } from './model/file-template.model';
