// The people barrel: only what a foreign consumer needs (charter §3; spec 006). Each export names
// its consumer. Future consumers, from the old app at SOURCE_SHA, are listed in reports/006-report.md.

// app.routes.ts (the office shell's children).
export { peopleRoutes } from './people.routes';

// Future: crm (lead-form, leads-list, crm-stage-panel), dashboard, projects (member-form-dialog,
// project-detail, project-teams, dms-stage-detail, task-detail, task-form-dialog).
export { EmployeeService } from './data/employee.service';

// Future: projects (project-teams).
export { DepartmentService } from './data/department.service';

// Future: dashboard (dashboard.component).
export type { EmployeeListItem, EmployeeOverview, EmployeeTaskRef } from './model/employee.model';
