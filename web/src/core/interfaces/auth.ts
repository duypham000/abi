export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  full_name?: string;
}

export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface UserDto {
  id: string | number;
  username: string;
  email: string;
  fullName?: string;
  full_name?: string;
  active: boolean;
  enabled?: boolean;
  role: string;
  createdDate?: string;
  createdAt?: string;
}

export interface AuthUser {
  userId: string | number;
  username: string;
  email: string;
  role: string;
  fullName?: string;
  createdAt?: string;
  active?: boolean;
}

export interface APIKeyDto {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  role: string;
  scopes: string;
  expires_at?: string | null;
  last_used_at?: string | null;
  revoked_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  api_key?: string;
  key?: string;
}

export interface CreateAPIKeyRequest {
  name: string;
  user_id?: string;
  role?: string;
  scopes?: string;
  expires_in_days?: number;
}
