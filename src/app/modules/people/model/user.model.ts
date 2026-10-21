/**
 * One row of `GET /api/users` and `GET /api/roles/{roleId}/users` — backend v3's `UserListItem`
 * (`Identity.Contracts/Users/UsersContracts.cs`): every account, the seeded admin and clients
 * included. `roles` are role NAMES. (006b-1 #17.)
 */
export interface UserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: string;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: string[];
}
