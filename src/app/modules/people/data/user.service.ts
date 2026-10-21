import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { PagedResult } from '@platform/types/paged-result';
import { UserListItem } from '../model/user.model';

/** `GetUsersQueryValidator` caps `pageSize` at 200. */
const MAX_PAGE_SIZE = 200;

/**
 * `/api/users` — the account list (backend v3, `users.read`). Paged, with a literal search over
 * email and names (006b-1 #17).
 */
@Injectable({ providedIn: 'root' })
export class UserService extends ApiService {
  list(
    opts: { page?: number; pageSize?: number; search?: string } = {},
  ): Observable<PagedResult<UserListItem>> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), MAX_PAGE_SIZE);
    return this.get<unknown>('/users', { page, pageSize, search: opts.search || undefined }).pipe(
      map((response) => this.normalizePaged(response, pageSize)),
    );
  }

  /** Shared with `RoleService.users()`: both routes return `PagedResult<UserListItem>`. */
  normalizePaged(response: unknown, requestedPageSize: number): PagedResult<UserListItem> {
    const value = this.unwrap<Record<string, unknown>>(response);
    return {
      items: this.unwrapArray(this.field<unknown>(value, 'items') ?? value).map((u) =>
        this.normalizeUser(u),
      ),
      totalCount: this.field<number>(value, 'totalCount') ?? 0,
      page: this.field<number>(value, 'pageNumber') ?? 1,
      pageSize: this.field<number>(value, 'pageSize') ?? requestedPageSize,
      totalPages: this.field<number>(value, 'totalPages') ?? 1,
    };
  }

  private normalizeUser(source: unknown): UserListItem {
    return {
      id: this.field<string>(source, 'id') ?? '',
      email: this.field<string>(source, 'email') ?? '',
      firstName: this.field<string>(source, 'firstName') ?? '',
      lastName: this.field<string>(source, 'lastName') ?? '',
      userType: this.field<string>(source, 'userType') ?? '',
      isActive: this.field<boolean>(source, 'isActive') ?? false,
      lastLoginAt: this.field<string | null>(source, 'lastLoginAt') ?? null,
      roles: this.field<string[]>(source, 'roles') ?? [],
    };
  }
}
