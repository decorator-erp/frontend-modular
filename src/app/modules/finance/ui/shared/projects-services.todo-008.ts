import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

// TODO(008): an invented stub with no SOURCE_SHA counterpart (ORDER of 007 before 008). The old
// finance forms import ProjectStageService and ProjectTaskService from core/http; in DMS they land
// with modules/projects at 008. Then the five forms import both from '@modules/projects' and this
// file is deleted. Until 008 the stage and task pickers are empty, as when the call fails.

export interface ProjectStageRef {
  id: string;
  name: string;
}

export interface ProjectTaskRef {
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectStageService {
  getByProject(_projectId: string): Observable<ProjectStageRef[]> {
    return of([]);
  }
}

@Injectable({ providedIn: 'root' })
export class ProjectTaskService {
  getByProject(_projectId: string): Observable<ProjectTaskRef[]> {
    return of([]);
  }
}
