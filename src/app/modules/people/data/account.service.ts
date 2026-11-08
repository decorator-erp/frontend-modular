import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';

/**
 * Sync F5: the caller's own account. `POST /api/auth/change-password { currentPassword, newPassword }`
 * → 204 (dms Identity AuthEndpoints.cs:65, any signed-in user; `ChangePasswordRequest`,
 * AuthContracts.cs:32). The account is always the caller's. A success revokes every refresh token and
 * bumps the security stamp, so every session ends. Refusals: 400 `authentications.ChangePasswordFailed`
 * (wrong current password or the password policy) or a validation 400; 429 on the auth rate limit —
 * all shown by the card.
 */
@Injectable({ providedIn: 'root' })
export class AccountService extends ApiService {
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.post<void>(
      '/auth/change-password',
      { currentPassword, newPassword },
      { context: handled(400, 429) },
    );
  }
}
