import { Injectable, Signal, WritableSignal, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { EmployeeService } from '@modules/people';
import { handled } from '@platform/http/handled-errors';
import { PermissionsService } from '@platform/permissions';
import { ProjectService } from '../data/project.service';
import type { Project } from '../model/project.model';
import {
  ProjectAction,
  canChangeComment,
  canExecuteTask,
  canProjectAction,
  isProjectClosed,
  projectGate,
} from '../model/project-actions';

/**
 * crmp Part 2: one place every project work screen asks "may the caller do this here?". It holds the
 * project (for `myLevel`, status and active) per id, and the caller's employee id (for the assignee
 * and author rules), then answers with `canProjectAction` — the route claim AND the level AND an open
 * project. Screens call `ensure(projectId)` once and read `can(projectId, action)` in templates; after
 * a level-changing write or a 403 `projects.InsufficientLevel` they call `refresh(projectId)`.
 */
@Injectable({ providedIn: 'root' })
export class ProjectAccessStore {
  private readonly projects = inject(ProjectService);
  private readonly employees = inject(EmployeeService);
  private readonly permissions = inject(PermissionsService);

  private readonly byId = new Map<string, WritableSignal<Project | null>>();
  private readonly meId = signal<string | null>(null);
  private readonly failed = new Set<string>();
  private meRequested = false;

  /** The project signal for `id`, fetched once (null until it arrives, and on a failed read). */
  project(id: string): Signal<Project | null> {
    return this.slot(id).asReadonly();
  }

  /** Start loading the project (and the caller's employee id) if not loaded yet. */
  ensure(id: string): void {
    if (!id) return;
    // R-P2-F9: a project that failed to load (null) is read again on the next ensure().
    const needsFetch = !this.byId.has(id) || this.failed.has(id);
    this.slot(id);
    if (needsFetch) this.fetch(id);
    this.ensureMe();
  }

  refresh(id: string): void {
    if (id) this.fetch(id);
  }

  /** Seed from a project the screen already read (details or get), so no extra request is made. */
  seed(project: Project): void {
    this.slot(project.id).set(project);
    this.ensureMe();
  }

  me(): string | null {
    return this.meId();
  }

  can(id: string, action: ProjectAction): boolean {
    return canProjectAction(this.byId.get(id)?.() ?? null, action, (p) => this.permissions.can(p));
  }

  closed(id: string): boolean {
    const p = this.byId.get(id)?.();
    return !!p && isProjectClosed(p);
  }

  canExecute(
    id: string,
    task: { assignedToId: string | null },
    action: 'task.start' | 'task.complete',
  ): boolean {
    const p = this.byId.get(id)?.();
    if (!p) return false;
    return canExecuteTask(
      projectGate(p),
      task,
      this.meId(),
      (x) => this.permissions.can(x),
      action,
    );
  }

  canComment(
    id: string,
    comment: { employeeId: string },
    action: 'comment.edit' | 'comment.delete',
  ): boolean {
    const p = this.byId.get(id)?.();
    if (!p) return false;
    return canChangeComment(
      projectGate(p),
      comment,
      this.meId(),
      (x) => this.permissions.can(x),
      action,
    );
  }

  private slot(id: string): WritableSignal<Project | null> {
    let s = this.byId.get(id);
    if (!s) {
      s = signal<Project | null>(null);
      this.byId.set(id, s);
    }
    return s;
  }

  private fetch(id: string): void {
    this.failed.delete(id);
    this.projects
      .getById(id)
      .pipe(catchError(() => of(null)))
      .subscribe((p) => {
        if (!p) this.failed.add(id);
        this.slot(id).set(p);
      });
  }

  /** `GET /api/employees/me` (contract §2.17.2 "Caller's employee id"); a 404/403 just means none. */
  private ensureMe(): void {
    if (this.meRequested) return;
    this.meRequested = true;
    this.employees
      .getMe({ context: handled(403, 404) })
      .pipe(catchError(() => of(null)))
      .subscribe((e) => this.meId.set(e?.id ?? null));
  }
}
