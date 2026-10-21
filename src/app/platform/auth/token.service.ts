import { Injectable } from '@angular/core';
import { jwtDecode } from 'jwt-decode';
import { AuthState } from './auth.models';

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  roles?: string | string[];
  permissions?: string | string[];
  exp: number;
  iat: number;
}

@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly TOKEN_KEY = 'dms_token';
  private readonly REFRESH_KEY = 'dms_refresh';

  setTokens(token: string, refreshToken: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.REFRESH_KEY, refreshToken);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY) ?? localStorage.getItem('access_token');
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_KEY) ?? localStorage.getItem('refresh_token');
  }

  clear(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token_expiration');
  }

  isTokenExpired(token: string): boolean {
    try {
      const { exp } = jwtDecode<JwtPayload>(token);
      return Date.now() >= exp * 1000;
    } catch {
      return true;
    }
  }

  parseUser(token: string): AuthState {
    const payload = jwtDecode<JwtPayload>(token);
    let roles: string[] = [];
    if (Array.isArray(payload.roles)) {
      roles = payload.roles;
    } else {
      try {
        roles = JSON.parse(payload.roles ?? '[]') as string[];
      } catch {
        roles = payload.roles ? [payload.roles] : [];
      }
    }

    const permissions = Array.isArray(payload.permissions)
      ? payload.permissions
      : payload.permissions
        ? [payload.permissions]
        : [];

    return {
      userId: payload.sub,
      userName: payload.name,
      email: payload.email,
      roles,
      permissions,
      isActive: true,
      isSupervisor: roles.some((role) => role.toLowerCase() === 'departmenthead'),
    };
  }
}
