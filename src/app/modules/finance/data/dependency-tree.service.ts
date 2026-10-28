import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import type {
  DependencyDirection,
  StageDependencyTreeResponse,
  TaskDependencyTreeResponse,
} from '../model/dependency-tree.model';

/**
 * Dependency trees with financial rollups — `/{tasks,stages}/{id}/dependencies/tree`
 * (financial-queries spec). Returns the rooted tree plus an aggregate
 * `FinancialRollup` and cycle / depth-truncation flags.
 */
@Injectable({ providedIn: 'root' })
export class DependencyTreeService extends ApiService {
  forTask(
    taskId: string,
    params?: { direction?: DependencyDirection; maxDepth?: number },
  ): Observable<TaskDependencyTreeResponse> {
    // GET /api/project-tasks/{id}/dependencies/tree (DependencyEndpoints.cs)
    return this.get<unknown>(`/project-tasks/${taskId}/dependencies/tree`, params).pipe(
      map((r) => this.unwrap<TaskDependencyTreeResponse>(r)),
    );
  }

  forStage(
    stageId: string,
    params?: { direction?: DependencyDirection; includeStageTasks?: boolean; maxDepth?: number },
  ): Observable<StageDependencyTreeResponse> {
    // GET /api/project-stages/{id}/dependencies/tree (DependencyEndpoints.cs)
    return this.get<unknown>(`/project-stages/${stageId}/dependencies/tree`, params).pipe(
      map((r) => this.unwrap<StageDependencyTreeResponse>(r)),
    );
  }
}
