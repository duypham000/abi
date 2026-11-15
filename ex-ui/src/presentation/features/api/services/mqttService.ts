import mqtt, { type MqttClient } from "mqtt";
import type { MqttConfig, MqttQos } from "../types/realtime";

let client: MqttClient | null = null;

export const mqttService = {
  connect(
    url: string,
    clientId: string,
    config: MqttConfig,
    callbacks: {
      onConnect: () => void;
      onMessage: (topic: string, payload: string) => void;
      onError: (e: Error) => void;
      onClose: () => void;
    }
  ) {
    mqttService.disconnect();

    const willOptions =
      config.lastWill.topic
        ? {
            topic: config.lastWill.topic,
            payload: config.lastWill.message,
            qos: config.lastWill.qos as 0 | 1 | 2,
            retain: config.lastWill.retain,
          }
        : undefined;

    client = mqtt.connect(url, {
      clientId,
      username: config.username || undefined,
      password: config.password || undefined,
      keepalive: config.keepAlive,
      clean: config.cleanSession,
      will: willOptions,
    });

    client.on("connect", callbacks.onConnect);
    client.on("message", (topic: string, payload: Buffer) =>
      callbacks.onMessage(topic, payload.toString())
    );
    client.on("error", (e: Error) => callbacks.onError(e));
    client.on("close", callbacks.onClose);
  },

  subscribe(topic: string, qos: MqttQos) {
    client?.subscribe(topic, { qos });
  },

  unsubscribe(topic: string) {
    client?.unsubscribe(topic);
  },

  publish(topic: string, message: string, qos: MqttQos, retain: boolean) {
    client?.publish(topic, message, { qos, retain });
  },

  disconnect() {
    if (client) {
      client.removeAllListeners();
      client.end(true);
      client = null;
    }
  },
};
