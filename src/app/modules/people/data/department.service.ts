import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CreateDepartmentRequest,
  DepartmentResponse,
  EmployeeListResponse,
  UpdateDepartmentRequest,
} from '../model/people.model';
import { ApiService } from '@platform/http/api.service';

/** `GetDepartmentsQueryValidator` caps `pageSize` at 200. */
const MAX_PAGE_SIZE = 200;

/**
 * `/api/departments`, plus the employee↔department routes that live under `/api/employees`.
 *
 * Note the asymmetry: assigning, removing and moving an employee are all addressed by EMPLOYEE id
 * first (`/api/employees/{employeeId}/department/...`), while the department head routes hang off
 * the department. That mirrors the backend's own grouping.
 */
@Injectable({ providedIn: 'root' })
export class DepartmentService extends ApiService {
  /**
   * Paging is optional server-side (defaults 1 / 200) but sent explicitly so the size is ours.
   *
   * Returns ACTIVE departments only — `GetDepartmentsQueryHandler` filters on `IsActive`, so a
   * soft-deleted department disappears from here while remaining fetchable by id.
   */
  getAll(
    pageNumber = 1,
    pageSize = MAX_PAGE_SIZE,
    nameFilter?: string,
  ): Observable<DepartmentResponse[]> {
    const params: Record<string, unknown> = {
      pageNumber,
      pageSize: Math.min(pageSize, MAX_PAGE_SIZE),
    };
    if (nameFilter) params['nameFilter'] = nameFilter;
    return this.get<unknown>('/departments', params).pipe(
      map((response) =>
        this.unwrapArray(response).map((department) => this.normalizeDepartment(department)),
      ),
    );
  }

  getById(id: string): Observable<DepartmentResponse> {
    return this.get<unknown>(`/departments/${id}`).pipe(
      map((response) => this.normalizeDepartment(this.unwrap(response))),
    );
  }

  /** Members as full `EmployeeProfile` objects — the endpoint composes the names for us. */
  getMembers(id: string): Observable<EmployeeListResponse[]> {
    return this.get<unknown>(`/departments/${id}/members`).pipe(
      map((response) =>
        this.unwrapArray(response).map((employee) => this.normalizeEmployee(employee)),
      ),
    );
  }

  /** Answers 200 (not 201) with `{ departmentId }`. */
  create(req: CreateDepartmentRequest): Observable<string> {
    return this.post<unknown>('/departments', req).pipe(
      map((response) => this.field<string>(this.unwrap(response), 'departmentId') ?? ''),
    );
  }

  update(id: string, req: UpdateDepartmentRequest): Observable<void> {
    return this.put<void>(`/departments/${id}`, req);
  }

  /** Soft delete — sets `IsActive = false`. There is no reactivate route. */
  deleteDepartment(id: string): Observable<void> {
    return this.delete<void>(`/departments/${id}`);
  }

  addEmployee(deptId: string, employeeId: string): Observable<void> {
    return this.post<void>(`/employees/${employeeId}/department/${deptId}`, {});
  }

  removeEmployee(deptId: string, employeeId: string): Observable<void> {
    return this.delete<void>(`/employees/${employeeId}/department/${deptId}`);
  }

  /**
   * Move an employee to a new department. The SOURCE department is neither needed nor accepted —
   * the handler picks the most recently created active membership itself. (The old signature took
   * a source id and fell back to it as the target, which could move someone to where they already
   * were.)
   */
  moveEmployee(employeeId: string, newDepartmentId: string): Observable<void> {
    return this.post<void>(`/employees/${employeeId}/department/${newDepartmentId}/move`, {});
  }

  /**
   * Assign the department head. NOT an upsert: 400s with `departments.AlreadyHaveHead` when one is
   * already set, so a reassignment must `removeHead` first. Also inserts the membership row if the
   * employee is not already a member.
   */
  assignHead(deptId: string, employeeId: string): Observable<void> {
    return this.post<void>(`/departments/${deptId}/head/${employeeId}`, {});
  }

  /** 400s with `departments.DepartmentHeadNotAssign` when no head is set. */
  removeHead(deptId: string): Observable<void> {
    return this.delete<void>(`/departments/${deptId}/head`);
  }

  private normalizeDepartment(source: unknown): DepartmentResponse {
    return {
      id: this.field<string>(source, 'id') ?? '',
      name: this.field<string>(source, 'name') ?? '',
      description: this.field<string | null>(source, 'description') ?? null,
      // A scalar id. There is no `departmentHead` OBJECT on the wire and never was — branching on
      // one is why every row used to read "No head assigned" even when a head was set.
      departmentHeadId: this.field<string | null>(source, 'departmentHeadId') ?? null,
      isActive: this.field<boolean>(source, 'isActive') ?? true,
    };
  }

  private normalizeEmployee(source: unknown): EmployeeListResponse {
    return {
      id: this.field<string>(source, 'id') ?? '',
      appUserId: this.field<string>(source, 'appUserId') ?? '',
      fullName: this.field<string>(source, 'fullName') ?? '',
      email: this.field<string | null>(source, 'email') ?? null,
      jobTitle: this.field<string>(source, 'jobTitle') ?? '',
      isActive: this.field<boolean>(source, 'isActive') ?? false,
      primaryDepartmentId: this.field<string | null>(source, 'primaryDepartmentId') ?? null,
    };
  }
}
