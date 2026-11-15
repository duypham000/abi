export type RealtimeConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED";

export type SseState = "STOPPED" | "STARTING" | "STARTED";

export type LogSource = "client" | "server" | "info" | "disconnected";
export type LogEvent =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type MqttQos = 0 | 1 | 2;

export interface LogEntry {
  id: string;
  ts: number;
  source: LogSource;
  payload: string;
  prefix?: string;
  event?: LogEvent;
  topic?: string;
}

export interface WsProtocol {
  id: string;
  value: string;
  enabled: boolean;
}

export interface SioAuthConfig {
  type: "none" | "bearer";
  token: string;
  enabled: boolean;
}

export interface MqttLastWill {
  topic: string;
  message: string;
  qos: MqttQos;
  retain: boolean;
}

export interface MqttConfig {
  username: string;
  password: string;
  keepAlive: number;
  cleanSession: boolean;
  lastWill: MqttLastWill;
}

export interface MqttSubscription {
  id: string;
  topic: string;
  qos: MqttQos;
  color: string;
}
