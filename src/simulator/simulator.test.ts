import { PIDS } from '../protocol/pids';
import { MODE1_ENCODERS, asciiBytes, encodeDtc, formatResponse, supportedMask } from './encoding';
import { ElmEmulator } from './elm-emulator';
import { SimulatedVehicle } from './vehicle';
import { decodeDtc } from '../protocol/dtc';
import { parseFrames } from '../protocol/response';

function vehicleAt(seconds: number) {
  let now = 0;
  const vehicle = new SimulatedVehicle(() => now);
  now = seconds * 1000;
  return vehicle.state();
}

describe('SimulatedVehicle', () => {
  it('idles at the start of the cycle and reaches highway speed later', () => {
    expect(vehicleAt(2).speed).toBeLessThan(2);
    expect(vehicleAt(2).rpm).toBeGreaterThan(700);
    expect(vehicleAt(30).speed).toBeGreaterThan(80);
  });

  it('keeps every value inside physical limits over many cycles', () => {
    for (let t = 0; t < 600; t += 0.5) {
      const s = vehicleAt(t);
      expect(s.rpm).toBeGreaterThanOrEqual(700);
      expect(s.rpm).toBeLessThanOrEqual(6000);
      expect(s.throttle).toBeGreaterThanOrEqual(0);
      expect(s.load).toBeLessThanOrEqual(100);
      expect(s.coolant).toBeLessThanOrEqual(95);
      expect(s.fuelLevel).toBeGreaterThan(0);
    }
  });

  it('warms the engine up over time', () => {
    expect(vehicleAt(600).coolant).toBeGreaterThan(vehicleAt(1).coolant);
  });
});

describe('encoder / decoder round trip', () => {
  it('every simulated PID decodes back to the simulated value', () => {
    const state = vehicleAt(30);
    const expected: Record<number, number> = {
      0x04: state.load,
      0x05: state.coolant,
      0x0b: state.manifoldPressure,
      0x0c: state.rpm,
      0x0d: state.speed,
      0x0f: state.intakeTemp,
      0x10: state.maf,
      0x11: state.throttle,
      0x1f: state.runtime,
      0x2f: state.fuelLevel,
      0x42: state.voltage,
      0x46: state.ambientTemp,
      0x5c: state.oilTemp,
      0x5e: state.fuelRate,
    };

    for (const [pid, value] of Object.entries(expected)) {
      const def = PIDS.find((candidate) => candidate.pid === Number(pid))!;
      const decoded = def.decode(MODE1_ENCODERS[Number(pid)]!(state, 0)) as number;
      expect(Math.abs(decoded - value)).toBeLessThanOrEqual(Math.max(0.5, Math.abs(value) * 0.01));
    }
  });

  it('round-trips DTC codes', () => {
    for (const code of ['P0301', 'C0123', 'B1234', 'U0100', 'P2A00']) {
      expect(decodeDtc(...encodeDtc(code))).toBe(code);
    }
  });
});

describe('formatResponse', () => {
  const payload = [0x49, 0x02, 0x01, ...asciiBytes('ABCDEFGHIJKLMNOPQ', 17)];

  it('produces ISO-TP frames that the parser reassembles', () => {
    const lines = formatResponse('7E8', payload, { headers: true, spaces: true });
    expect(lines.length).toBeGreaterThan(1);
    expect(parseFrames(lines, true)[0]?.bytes).toEqual(payload);
  });

  it('produces the adapter multi-line format with headers off', () => {
    const lines = formatResponse('7E8', payload, { headers: false, spaces: true });
    expect(lines[0]).toBe('014');
    expect(parseFrames(lines, false)[0]?.bytes).toEqual(payload);
  });

  it('pads single frames to 8 data bytes with headers on', () => {
    expect(formatResponse('7E8', [0x41, 0x0d, 0x30], { headers: true, spaces: true })).toEqual([
      '7E8 03 41 0D 30 00 00 00 00',
    ]);
  });
});

describe('supportedMask', () => {
  it('sets the continuation bit when higher pages exist', () => {
    expect(supportedMask(0x00, [0x01, 0x0c, 0x21])).toEqual([0x80, 0x10, 0x00, 0x01]);
    expect(supportedMask(0x20, [0x21, 0x42])).toEqual([0x80, 0x00, 0x00, 0x01]);
    expect(supportedMask(0x20, [0x21, 0x30])).toEqual([0x80, 0x01, 0x00, 0x00]);
  });
});

describe('ElmEmulator', () => {
  const emulator = (options = {}) => new ElmEmulator({ latencyMs: 0, ...options });

  it('honours echo and header settings', () => {
    const elm = emulator();
    expect(elm.echoEnabled).toBe(true);
    elm.handle('ATE0');
    expect(elm.echoEnabled).toBe(false);
    elm.handle('ATZ');
    expect(elm.echoEnabled).toBe(true);
  });

  it('answers "?" to unknown commands and NO DATA to unsupported PIDs', () => {
    const elm = emulator();
    expect(elm.handle('ATXYZ').lines).toEqual(['?']);
    expect(elm.handle('hello').lines).toEqual(['?']);
    elm.handle('0100');
    expect(elm.handle('012C').lines).toEqual(['NO DATA']);
  });

  it('prints SEARCHING... only for the first request after a reset', () => {
    const elm = emulator();
    expect(elm.handle('0100').lines[0]).toBe('SEARCHING...');
    expect(elm.handle('0100').lines[0]).not.toBe('SEARCHING...');
  });

  it('injects bus errors according to errorRate', () => {
    const elm = new ElmEmulator({ latencyMs: 0, errorRate: 1 }, { random: () => 0 });
    expect(elm.handle('010C').lines).toEqual(['CAN ERROR']);
  });
});
