// The library barrel: only what a foreign consumer needs (charter §3; spec 005). Each export names
// its consumer. Future consumers, from the old app at SOURCE_SHA, are listed in reports/005-report.md.

// app.routes.ts (the office shell's children).
export { libraryRoutes } from './library.routes';

// Future: projects (project-create).
export { StageTemplatesService } from './data/stage-templates.service';

// Projects scope of work (specs/sow-scope-of-work.md): the stage picker's template stages
// (defaultFee / taskCount). 008b #10.
export type { TemplateStage } from './model/stage-template.model';

// Sync F3: projects (task page "Apply template"). A loader, not the class, so the dialog and the
// file template service stay out of the initial bundle (this barrel is imported eagerly).
export const loadApplyFileTemplateDialog = () =>
  import('./ui/file-templates/apply-file-template-dialog.component').then(
    (m) => m.ApplyFileTemplateDialogComponent,
  );
export type { ApplyFileTemplateDialogData } from './ui/file-templates/apply-file-template-dialog.component';
