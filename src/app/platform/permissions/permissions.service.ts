import { Injectable, inject } from '@angular/core';
import { AuthStore } from '../auth/auth.store';

@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly authStore = inject(AuthStore);

  can(permission: string | string[]): boolean {
    const perms = Array.isArray(permission) ? permission : [permission];
    // PERM strings are the live backend claim spelling — check them directly.
    return perms.filter(Boolean).some((p) => this.authStore.can(p));
  }

  hasRole(role: string | string[]): boolean {
    const roles = Array.isArray(role) ? role : [role];
    return roles.filter(Boolean).some((r) => this.authStore.hasRole(r));
  }
}
