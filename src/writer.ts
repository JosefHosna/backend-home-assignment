
import amqp from "amqplib";
import { Pool } from "pg";
import { config } from "./config/config"; 
import { CarState } from "./types/carState";


// In-memory stav aut
const carStates: Record<number, CarState> = {};

// Handlery pro jednotlivé typy topiců
type Handler = (car: CarState, parts: string[], value: any) => void;

const handlers: { [key: string]: Handler } = {
  latitude: (car, _, value) => {
    car.latitude = value;
  },
  longitude: (car, _, value) => {
    car.longitude = value;
  },
  gear: (car, _, value) => {
    car.gear = value === "N" ? 0 : parseInt(value, 10);
  },
  speed: (car, _, value) => {
    car.speed = value * 3.6; // m/s → km/h
  },
  soc: (car, parts, value) => {
    const batteryIndex = parseInt(parts[3], 10);
    car.socBatteries[batteryIndex] = value;
  },
  capacity: (car, parts, value) => {
    const batteryIndex = parseInt(parts[3], 10);
    car.capacityBatteries[batteryIndex] = value;
  },
};

async function startWriter() {
  // Připojení k RabbitMQ
  const connection = await amqp.connect(config.rabbitUrl);
  const channel = await connection.createChannel();
  await channel.assertQueue(config.queueName, { durable: true });
  console.log("✅ Connected to RabbitMQ, waiting for messages...");

  // Připojení k Postgresu
  const pool = new Pool(config.postgres);
  console.log("✅ Connected to Postgres");

  // Spotřebování zpráv
  channel.consume(config.queueName, (msg) => {
    if (!msg) return;

    const message = JSON.parse(msg.content.toString());
    const { topic, payload, timestamp } = message;
    const carId = parseInt(topic.split("/")[1], 10);

    if (!carStates[carId]) {
      carStates[carId] = {
        car_id: carId,
        latitude: null,
        longitude: null,
        gear: null,
        speed: null,
        socBatteries: {},
        capacityBatteries: {},
        timestamp: null,
      };
    }

    const car = carStates[carId];
    const value = JSON.parse(payload).value;
    const parts = topic.split("/");

    const lastPart = parts[parts.length - 1];
    if (handlers[lastPart]) {
      handlers[lastPart](car, parts, value);
    }

    car.timestamp = new Date(timestamp);
    carStates[carId] = car;

    channel.ack(msg);
  });

  // Každých 5s uložíme snapshot do DB
  setInterval(async () => {
    const now = new Date();

    for (const state of Object.values(carStates)) {
      if (!state.latitude || !state.longitude) continue;

      // SOC = vážený průměr podle kapacit
      let totalCap = 0;
      let weightedSum = 0;
      for (const [index, soc] of Object.entries(state.socBatteries)) {
        const cap = state.capacityBatteries[parseInt(index, 10)];
        if (cap) {
          totalCap += cap;
          weightedSum += soc * cap;
        } else {
          console.log(`⚠️ Missing capacity for battery ${index} of car ${state.car_id}`);
        }
      }

      let overallSoc: number | null = null;
      if (totalCap > 0) {
        overallSoc = weightedSum / totalCap;
      } else if (Object.keys(state.socBatteries).length === 0) {
        console.log(`⚠️ No SOC data for car ${state.car_id}`);
      } else {
        console.log(`⚠️ SOC data present, but no valid capacity for car ${state.car_id}`);
      }

      await pool.query(
        `INSERT INTO car_state 
         (car_id, time, state_of_charge, latitude, longitude, gear, speed)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          state.car_id,
          now,
          overallSoc !== null ? Math.round(overallSoc) : null,
          state.latitude,
          state.longitude,
          state.gear,
          state.speed,
        ]
      );

      console.log("💾 Saved snapshot to DB:", {
        car_id: state.car_id,
        time: now.toISOString(),
        soc: overallSoc,
        lat: state.latitude,
        lon: state.longitude,
        gear: state.gear,
        speed: state.speed,
      });
    }
  }, 5000);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("👋 Shutting down writer...");
    await channel.close();
    await connection.close();
    await pool.end();
    process.exit(0);
  });
}

startWriter().catch(console.error);
