import { ProjectDetails, ProjectStage, ProjectTask } from '../../model/project.model';
import { DonutSegment } from '@ds';

/**
 * Client-side task aggregations for the project / stage dashboards. Pure,
 * design-token-driven (donut colors are CSS vars, never hex). Mirrors the DMS
 * dashboards' "Task status" and "Task priority" donuts (order + colors).
 *
 * No backend call — everything is derived from the already-loaded
 * `ProjectDetails` (stages[].tasks[] + unstagedTasks[]).
 */

/** Every task on the project: staged + unstaged. */
export function collectTasks(details: ProjectDetails | null): ProjectTask[] {
  if (!details) return [];
  return [...details.stages.flatMap((s) => s.tasks ?? []), ...details.unstagedTasks];
}

/** Tasks within a single stage. */
export function stageTasks(stage: ProjectStage | null | undefined): ProjectTask[] {
  return stage?.tasks ?? [];
}

/**
 * Task-status distribution → donut segments. Open + Locked collapse to the
 * "To do / locked" bucket. Labels are human strings (no raw enum casing) and the
 * bucket name matches the per-task list labels (Locked stays "Locked", Open reads
 * "To do") so the donut never contradicts the list.
 */
export function statusDistribution(tasks: ProjectTask[]): DonutSegment[] {
  let done = 0,
    inProgress = 0,
    toDo = 0,
    pending = 0,
    rejected = 0;
  for (const t of tasks) {
    switch (t.status) {
      case 'Completed':
        done++;
        break;
      case 'InProgress':
        inProgress++;
        break;
      case 'PendingApproval':
        pending++;
        break;
      case 'Rejected':
        rejected++;
        break;
      default:
        toDo++;
        break; // Open, Locked
    }
  }
  return [
    { label: 'Done', value: done, color: 'var(--color-success)' },
    { label: 'In progress', value: inProgress, color: 'var(--color-info)' },
    { label: 'To do / locked', value: toDo, color: 'var(--color-border-strong)' },
    { label: 'Pending approval', value: pending, color: 'var(--color-pending)' },
    { label: 'Rejected', value: rejected, color: 'var(--color-danger)' },
  ];
}

/** Task-priority distribution → donut segments (Urgent darkest → Low lightest). */
export function priorityDistribution(tasks: ProjectTask[]): DonutSegment[] {
  let urgent = 0,
    high = 0,
    medium = 0,
    low = 0;
  for (const t of tasks) {
    switch (t.priority) {
      case 'Urgent':
        urgent++;
        break;
      case 'High':
        high++;
        break;
      case 'Low':
        low++;
        break;
      default:
        medium++;
        break; // Medium
    }
  }
  return [
    { label: 'Urgent', value: urgent, color: 'var(--color-text-primary)' },
    { label: 'High', value: high, color: 'var(--color-text-secondary)' },
    { label: 'Medium', value: medium, color: 'var(--color-text-muted)' },
    { label: 'Low', value: low, color: 'var(--color-border-strong)' },
  ];
}
