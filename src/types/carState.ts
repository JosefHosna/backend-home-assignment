export interface CarState {
  car_id: number;
  latitude: number | null;
  longitude: number | null;
  gear: number | null;
  speed: number | null;
  socBatteries: { [index: number]: number };
  capacityBatteries: { [index: number]: number };
  timestamp: Date | null;
}
