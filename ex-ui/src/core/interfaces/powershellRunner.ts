export type PowerShellParamType = "switch" | "string" | "int" | "unknown";

export interface PowerShellParam {
  name: string;
  type: PowerShellParamType;
  defaultValue?: string | boolean | number;
}

export interface PowerShellScript {
  id: string;
  name: string;
  body: string;
  filePath?: string; // If imported from a file
  params: PowerShellParam[];
  createdAt: string;
  updatedAt: string;
}

export interface PowerShellRunHistory {
  id: string;
  scriptId: string;
  scriptName: string;
  workingDir: string;
  paramValues: Record<string, string | boolean | number>;
  pid?: number;
  status: "running" | "success" | "failed";
  startedAt: string;
  endedAt?: string;
  isHidden?: boolean;
  isAdmin?: boolean;
}
