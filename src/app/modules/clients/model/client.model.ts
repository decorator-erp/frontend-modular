// The client slice of the old `core/models/index.ts` at SOURCE_SHA (spec 005): lines 87–114,
// byte-for-byte.

export interface ClientResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  isActive: boolean;
  phoneNumber: string | null;
  address: string | null;
  notes: string | null;
}
export interface CreateClientRequest {
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  password: string;
  phone: string;
  address: string;
  notes?: string;
}
/**
 * crm-prod M8: `PUT /api/clients/{id}/profile` binds `UpdateProfileRequest(JobTitle, MaritalStatus,
 * RepresentativeName)` (ClientEndpoints.cs:33-45, record at :158) — the only client edit the backend
 * has. A `null` field keeps the stored value (Client.UpdateProfile). Name, phone, address and notes
 * have no update route (deferred).
 */
export interface UpdateClientRequest {
  jobTitle: string | null;
  maritalStatus: string | null;
  representativeName: string | null;
}
