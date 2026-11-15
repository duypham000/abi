import { invoke } from "@tauri-apps/api/core";

export const runScript = (body: string, hidden: boolean, admin: boolean): Promise<number> =>
  invoke("cmd_run_script", { body, hidden, admin });

export const killScript = (pid: number): Promise<void> =>
  invoke("cmd_kill_script", { pid });

export const showScriptWindow = (pid: number): Promise<void> =>
  invoke("cmd_show_script_window", { pid });

export const hideScriptWindow = (pid: number): Promise<void> =>
  invoke("cmd_hide_script_window", { pid });
