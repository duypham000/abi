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
  id: number;
  username: string;
  email: string;
  active: boolean;
  role: string;
  createdDate: string;
}

export interface AuthUser {
  userId: number;
  username: string;
  email: string;
  role: string;
}
