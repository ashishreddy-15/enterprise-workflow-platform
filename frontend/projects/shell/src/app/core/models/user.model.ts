export interface AuthenticatedUser {
  userId: string;
  roles: string[];
}

export interface LoginRequest {
  userId: string;
  roles: string[];
}

export interface LoginResponse {
  token: string;
  status: string;
  userId: string;
  roles: string;
}

export interface CurrentUserResponse {
  authenticated: boolean;
  userId?: string;
  roles?: string[];
}
