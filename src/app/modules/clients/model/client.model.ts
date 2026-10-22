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
export interface UpdateClientRequest {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  notes?: string;
}
