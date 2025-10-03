import dotenv from "dotenv";

// načteme proměnné z .env (pokud existuje)
dotenv.config();

export const config = {
  mqttUrl: process.env.MQTT_URL || "mqtt://localhost:51883",
  rabbitUrl: process.env.RABBIT_URL || "amqp://admin:admin@localhost:55672",
  postgres: {
    host: process.env.PG_HOST || "localhost",
    port: parseInt(process.env.PG_PORT || "55432", 10),
    user: process.env.PG_USER || "postgres",
    password: process.env.PG_PASSWORD || "postgres",
    database: process.env.PG_DATABASE || "postgres",
  },
  queueName: process.env.QUEUE_NAME || "car_state_raw",
  subscribeTopic: process.env.SUBSCRIBE_TOPIC || "car/1/#", 
  debug: process.env.DEBUG === "true",
};

