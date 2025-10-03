
export interface RawMessage {
  topic: string;
  payload: string; // původní MQTT payload (JSON.stringify(...))
  timestamp: number; // unix timestamp
}

