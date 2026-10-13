export interface VehicleState {
  speed: number;
  rpm: number;
  throttle: number;
  load: number;
  coolant: number;
  intakeTemp: number;
  oilTemp: number;
  ambientTemp: number;
  maf: number;
  manifoldPressure: number;
  timingAdvance: number;
  fuelLevel: number;
  fuelRate: number;
  shortTrim: number;
  longTrim: number;
  voltage: number;
  o2Voltage: number;
  runtime: number;
}

/** [seconds into the cycle, km/h] keyframes of a 60 s city/highway loop. */
const DRIVE_CYCLE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [6, 0],
  [18, 85],
  [34, 92],
  [44, 35],
  [52, 62],
  [60, 0],
];
const CYCLE_SECONDS = 60;
const GEAR_RPM_PER_KMH = [110, 62, 42, 31, 25] as const;
const GEAR_UP_KMH = [0, 18, 38, 58, 80] as const;
const IDLE_RPM = 820;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function speedAt(seconds: number): number {
  const t = seconds % CYCLE_SECONDS;
  for (let i = 1; i < DRIVE_CYCLE.length; i++) {
    const [t1, v1] = DRIVE_CYCLE[i]!;
    const [t0, v0] = DRIVE_CYCLE[i - 1]!;
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return 0;
}

/** Deterministic vehicle that repeats a drive cycle and warms up over time. */
export class SimulatedVehicle {
  private readonly startedAt: number;

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly warmStartCoolant = 45,
  ) {
    this.startedAt = clock();
  }

  state(): VehicleState {
    const t = (this.clock() - this.startedAt) / 1000;
    const speed = Math.round(Math.max(0, speedAt(t) + Math.sin(t * 1.7) * 0.8));
    const acceleration = speedAt(t + 1) - speedAt(t);

    const gear = GEAR_UP_KMH.filter((limit) => speed >= limit).length - 1;
    const rpm =
      speed < 3
        ? IDLE_RPM + Math.sin(t * 3) * 25
        : clamp(speed * (GEAR_RPM_PER_KMH[gear] ?? 25) + Math.sin(t * 2.3) * 40, 1000, 5800);

    const throttle = clamp(9 + Math.max(0, acceleration) * 4.5 + speed * 0.08, 0, 100);
    const load = clamp(18 + throttle * 0.55 + rpm / 260, 12, 98);
    const maf = rpm * (load / 100) * 0.0165;
    const coolant = 20 + (90 - 20) * (1 - Math.exp(-t / 150));
    const coolantNow = Math.max(this.warmStartCoolant, coolant);

    return {
      speed,
      rpm: Math.round(rpm),
      throttle: round(throttle, 1),
      load: round(load, 1),
      coolant: Math.round(coolantNow),
      intakeTemp: Math.round(28 + (coolantNow - 28) * 0.12),
      oilTemp: Math.round(coolantNow * 0.9 + 8),
      ambientTemp: 24,
      maf: round(maf, 2),
      manifoldPressure: Math.round(24 + load * 0.7),
      timingAdvance: round(10 + rpm / 450 - load / 12, 1),
      fuelLevel: round(Math.max(5, 72 - t * 0.004), 1),
      fuelRate: round(maf * 0.3287, 2),
      shortTrim: round(Math.sin(t * 0.9) * 3, 1),
      longTrim: round(1.5 + Math.sin(t * 0.05), 1),
      voltage: round(13.8 + Math.sin(t * 0.4) * 0.15, 2),
      o2Voltage: round(0.45 + Math.sin(t * 2.1) * 0.4, 2),
      runtime: Math.floor(t),
    };
  }
}

const round = (value: number, digits: number): number => Number(value.toFixed(digits));
