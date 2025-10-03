import mqtt from "mqtt";
import amqplib from "amqplib";
import { config } from "./config/config";
import { RawMessage } from "./types/messages";

async function main() {
  // 1️⃣ RabbitMQ
  const connection = await amqplib.connect(config.rabbitUrl);
  const channel = await connection.createChannel();
  await channel.assertQueue(config.queueName, { durable: true });
  console.log("✅ Connected to RabbitMQ, queue ready:", config.queueName);

  // 2️⃣ MQTT
  const mqttClient = mqtt.connect(config.mqttUrl);

  mqttClient.on("connect", () => {
    console.log("✅ Connected to MQTT");
    mqttClient.subscribe(config.subscribeTopic, (err) => {
      if (err) {
        console.error("❌ Subscribe error:", err);
      } else {
        console.log(`📡 Subscribed to ${config.subscribeTopic}`);
      }
    });
  });

  // 3️⃣ Forwarding MQTT → RabbitMQ
  mqttClient.on("message", (topic, message) => {
    const payload = message.toString();

    let parsed: any;
    try {
      parsed = JSON.parse(payload);
    } catch {
      console.warn("⚠️ Skipping non-JSON payload:", payload);
      return;
    }

    const msg: RawMessage = { topic, payload: JSON.stringify(parsed), timestamp: Date.now() };

    channel.sendToQueue(config.queueName, Buffer.from(JSON.stringify(msg)), {
      persistent: true,
    });

    if (config.debug) {
      console.log(`➡️ Sent to queue: ${JSON.stringify(msg)}`);
    }
  });

  mqttClient.on("error", (err) => console.error("❌ MQTT error:", err));
  connection.on("error", (err) => console.error("❌ RabbitMQ error:", err));

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("👋 Shutting down collector...");
    await channel.close();
    await connection.close();
    mqttClient.end();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("❌ Collector failed:", err);
});
