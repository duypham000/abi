export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
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

