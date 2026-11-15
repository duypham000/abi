export interface SecretItemDto {
  id: number;
  label: string;
  value: string;
  isSecret: boolean;
}

export interface SecretItemRequest {
  id?: number | null;
  label: string;
  value: string;
  isSecret: boolean;
}

export interface SecretGroupDto {
  id: number;
  title: string;
  parentId: number | null;
  description: string;
  createdAt: string;
  depth: number;
  hasChildren: boolean;
  secretCount: number;
}

export interface SecretGroupRequest {
  title: string;
  description: string;
  parentId?: number | null;
}

export interface UserSummaryDto {
  id: number;
  username: string;
  email: string;
}

export interface SecretAuditLogDto {
  action: string;
  performedBy: string;
  performedAt: string;
}

export interface SecretDto {
  id: number;
  title: string;
  description?: string | null;
  groupId?: number | null;
  groupName?: string | null;
  groupPath?: string | null;
  tags: string[];
  favorite: boolean;
  createdAt: string;
  items: SecretItemDto[];
  preview?: string | null;
  highlights?: Record<string, string[]> | null;
}

export interface SecretDetailDto extends SecretDto {
  auditLogs: SecretAuditLogDto[];
}

export interface SecretRequest {
  title: string;
  description?: string | null;
  groupId?: number | null;
  tags: string[];
  favorite: boolean;
  items: SecretItemRequest[];
}
