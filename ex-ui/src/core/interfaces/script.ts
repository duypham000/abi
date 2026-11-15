export interface Script {
  id: string;
  title: string;
  description: string;
  body: string;
  startWithWindow: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RunningProcess {
  instanceId: string;
  scriptId: string;
  scriptTitle: string;
  pid: number;
  isHidden: boolean;
  isAdmin: boolean;
  startedAt: string;
}

export type RunMode = "normal" | "hidden" | "admin";

export interface RunHistory {
  id: string;
  scriptId: string;
  scriptTitle: string;
  startedAt: string;
  endedAt: string;
  mode: RunMode;
}
