import { OBD2Command } from './types';

/**
 * Converts a hexadecimal string to its decimal equivalent.
 */
const hexToDec = (hex: string): number => parseInt(hex, 16);

/**
 * Extracts data bytes from an OBD2 response, skipping mode + PID prefix.
 * Example: "410C1AF8" → mode=41, pid=0C, data=["1A","F8"]
 */
function extractDataBytes(response: string, commandPid: string): string[] {
  const mode = commandPid.substring(0, 2);
  const pid = commandPid.substring(2).toUpperCase();
  const expectedPrefix =
    (parseInt(mode, 16) + 0x40).toString(16).toUpperCase() + pid;

  const data = response.toUpperCase().replace(/\s+/g, '');

  const idx = data.indexOf(expectedPrefix);
  const relevant = idx >= 0 ? data.substring(idx + expectedPrefix.length) : data;

  const bytes: string[] = [];
  for (let i = 0; i + 1 < relevant.length; i += 2) {
    const byte = relevant.substring(i, i + 2);
    if (/^[0-9A-F]{2}$/.test(byte)) bytes.push(byte);
  }
  return bytes;
}

/**
 * All predefined OBD2 commands with their PIDs and decoder functions.
 */
export const OBD2_COMMANDS: Record<string, OBD2Command> = {
  PIDS_00: {
    name: 'PIDS_00',
    pid: '0100',
    description: 'Supported PIDs (00-20)',
    decoder: (data: string) => {
      const clean = data.replace(/[\s\r\n>]/g, '').toUpperCase();
      // Skip mode+pid prefix (4100) and extract 4 bytes (8 chars)
      const idx = clean.indexOf('4100');
      const hex = idx >= 0 ? clean.substring(idx + 4, idx + 12) : clean.substring(0, 8);
      if (hex.length < 8) return [];
      const supported: string[] = [];
      for (let i = 0; i < 4; i++) {
        const byte = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        for (let bit = 0; bit < 8; bit++) {
          if ((byte & (1 << (7 - bit))) !== 0) {
            const pidNum = i * 8 + bit + 1;
            supported.push(pidNum.toString(16).toUpperCase().padStart(2, '0'));
          }
        }
      }
      return supported;
    },
    unit: 'PID',
  },

  DTC_STATUS: {
    name: 'DTC_STATUS',
    pid: '0101',
    description: 'DTC status since last clearing',
    decoder: (data: string) => {
      const clean = data.replace(/[\s\r\n>]/g, '').toUpperCase();
      const idx = clean.indexOf('4101');
      const hex = idx >= 0 ? clean.substring(idx + 4) : clean;
      const bytes = hex.match(/.{1,2}/g) || [];
      const statusByte = bytes.length > 0 ? parseInt(bytes[0]!, 16) : 0;
      const dtcCount = bytes.length > 1 ? parseInt(bytes[1]!, 16) : 0;
      return {
        milOn: (statusByte & 0x80) !== 0,
        dtcCount,
        readinessFlags: {
          misfire: (statusByte & 0x01) === 0,
          fuelSystem: (statusByte & 0x02) === 0,
          components: (statusByte & 0x04) === 0,
        },
      };
    },
    unit: 'STATUS',
  },

  ENGINE_LOAD: {
    name: 'ENGINE_LOAD',
    pid: '0104',
    description: 'Calculated engine load',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '0104');
      return bytes.length >= 1 ? (hexToDec(bytes[0]!) * 100) / 255 : 0;
    },
    unit: '%',
  },

  COOLANT_TEMP: {
    name: 'COOLANT_TEMP',
    pid: '0105',
    description: 'Engine coolant temperature',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '0105');
      return bytes.length >= 1 ? hexToDec(bytes[0]!) - 40 : 0;
    },
    unit: '°C',
  },

  FUEL_PRESSURE: {
    name: 'FUEL_PRESSURE',
    pid: '010A',
    description: 'Fuel pressure',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '010A');
      return bytes.length >= 1 ? hexToDec(bytes[0]!) * 3 : 0;
    },
    unit: 'kPa',
  },

  INTAKE_PRESSURE: {
    name: 'INTAKE_PRESSURE',
    pid: '010B',
    description: 'Intake manifold absolute pressure (MAP)',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '010B');
      return bytes.length >= 1 ? hexToDec(bytes[0]!) : 0;
    },
    unit: 'kPa',
  },

  ENGINE_RPM: {
    name: 'ENGINE_RPM',
    pid: '010C',
    description: 'Engine RPM',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '010C');
      if (bytes.length >= 2) {
        return (hexToDec(bytes[0]!) * 256 + hexToDec(bytes[1]!)) / 4;
      }
      return 0;
    },
    unit: 'rpm',
  },

  VEHICLE_SPEED: {
    name: 'VEHICLE_SPEED',
    pid: '010D',
    description: 'Vehicle speed',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '010D');
      return bytes.length >= 1 ? hexToDec(bytes[0]!) : 0;
    },
    unit: 'km/h',
  },

  TIMING_ADVANCE: {
    name: 'TIMING_ADVANCE',
    pid: '010E',
    description: 'Timing advance (cylinder 1)',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '010E');
      return bytes.length >= 1 ? hexToDec(bytes[0]!) / 2 - 64 : 0;
    },
    unit: '°',
  },

  INTAKE_TEMP: {
    name: 'INTAKE_TEMP',
    pid: '010F',
    description: 'Intake air temperature',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '010F');
      return bytes.length >= 1 ? hexToDec(bytes[0]!) - 40 : 0;
    },
    unit: '°C',
  },

  MAF_RATE: {
    name: 'MAF_RATE',
    pid: '0110',
    description: 'Mass air flow sensor air flow rate (MAF)',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '0110');
      if (bytes.length >= 2) {
        return (hexToDec(bytes[0]!) * 256 + hexToDec(bytes[1]!)) / 100;
      }
      return 0;
    },
    unit: 'g/s',
  },

  THROTTLE_POS: {
    name: 'THROTTLE_POS',
    pid: '0111',
    description: 'Absolute throttle position',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '0111');
      return bytes.length >= 1 ? (hexToDec(bytes[0]!) * 100) / 255 : 0;
    },
    unit: '%',
  },

  OBD_STANDARDS: {
    name: 'OBD_STANDARDS',
    pid: '011C',
    description: 'OBD standards compliance',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '011C');
      if (bytes.length === 0) return 'Unknown';

      const value = parseInt(bytes[0]!, 16);
      // PID 011C returns a single byte value (1=OBD-II CARB, 2=OBD EPA, etc.)
      // NOT a bitmask!
      const map: Record<number, string> = {
        1: 'OBD-II (CARB)',
        2: 'OBD (EPA)',
        3: 'OBD + OBD-II',
        4: 'OBD-I',
        5: 'Not OBD compliant',
        6: 'EOBD',
        7: 'EOBD + OBD-II',
        9: 'OBD + EOBD',
        10: 'JOBD',
        11: 'JOBD + OBD-II',
        12: 'JOBD + EOBD',
        13: 'JOBD + OBD-II + EOBD',
      };
      return map[value] || `Unknown (${value})`;
    },
  },

  // Oxygen (Lambda) Sensors - Mode 05 (O2 Test Results)
  O2S1_WR: {
    name: 'O2S1_WR',
    pid: '0113',
    description: 'O2 Sensor 1 Wide Range Equivalent Ratio',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '0113');
      if (bytes.length >= 2) {
        const value = (parseInt(bytes[0]!, 16) * 256 + parseInt(bytes[1]!, 16)) / 32768;
        return value.toFixed(2);
      }
      return 0;
    },
    unit: 'λ',
  },
  O2S2_WR: {
    name: 'O2S2_WR',
    pid: '0114',
    description: 'O2 Sensor 2 Wide Range Equivalent Ratio',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '0114');
      if (bytes.length >= 2) {
        const value = (parseInt(bytes[0]!, 16) * 256 + parseInt(bytes[1]!, 16)) / 32768;
        return value.toFixed(2);
      }
      return 0;
    },
    unit: 'λ',
  },
  O2S3_WR: {
    name: 'O2S3_WR',
    pid: '0115',
    description: 'O2 Sensor 3 Wide Range Equivalent Ratio',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '0115');
      if (bytes.length >= 2) {
        const value = (parseInt(bytes[0]!, 16) * 256 + parseInt(bytes[1]!, 16)) / 32768;
        return value.toFixed(2);
      }
      return 0;
    },
    unit: 'λ',
  },
  O2S4_WR: {
    name: 'O2S4_WR',
    pid: '0116',
    description: 'O2 Sensor 4 Wide Range Equivalent Ratio',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '0116');
      if (bytes.length >= 2) {
        const value = (parseInt(bytes[0]!, 16) * 256 + parseInt(bytes[1]!, 16)) / 32768;
        return value.toFixed(2);
      }
      return 0;
    },
    unit: 'λ',
  },
  O2S1_V: {
    name: 'O2S1_V',
    pid: '0117',
    description: 'O2 Sensor 1 Voltage',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '0117');
      return bytes.length >= 1 ? parseInt(bytes[0]!, 16) * 0.005 : 0;
    },
    unit: 'V',
  },
  O2S2_V: {
    name: 'O2S2_V',
    pid: '0118',
    description: 'O2 Sensor 2 Voltage',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '0118');
      return bytes.length >= 1 ? parseInt(bytes[0]!, 16) * 0.005 : 0;
    },
    unit: 'V',
  },
  O2S3_V: {
    name: 'O2S3_V',
    pid: '0119',
    description: 'O2 Sensor 3 Voltage',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '0119');
      return bytes.length >= 1 ? parseInt(bytes[0]!, 16) * 0.005 : 0;
    },
    unit: 'V',
  },
  O2S4_V: {
    name: 'O2S4_V',
    pid: '011A',
    description: 'O2 Sensor 4 Voltage',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '011A');
      return bytes.length >= 1 ? parseInt(bytes[0]!, 16) * 0.005 : 0;
    },
    unit: 'V',
  },
  O2S1_ST: {
    name: 'O2S1_ST',
    pid: '011B',
    description: 'O2 Sensor 1 Short Term Fuel Trim',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '011B');
      return bytes.length >= 1 ? ((parseInt(bytes[0]!, 16) - 128) * 100) / 128 : 0;
    },
    unit: '%',
  },

  RUNTIME: {
    name: 'RUNTIME',
    pid: '011F',
    description: 'Run time since engine start',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '011F');
      if (bytes.length >= 2) {
        return hexToDec(bytes[0]!) * 256 + hexToDec(bytes[1]!);
      }
      return 0;
    },
    unit: 'seconds',
  },

  FUEL_LEVEL: {
    name: 'FUEL_LEVEL',
    pid: '012F',
    description: 'Fuel tank level input',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '012F');
      return bytes.length >= 1 ? (hexToDec(bytes[0]!) * 100) / 255 : 0;
    },
    unit: '%',
  },

  BAROMETRIC_PRESSURE: {
    name: 'BAROMETRIC_PRESSURE',
    pid: '0133',
    description: 'Absolute barometric pressure',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '0133');
      return bytes.length >= 1 ? hexToDec(bytes[0]!) : 0;
    },
    unit: 'kPa',
  },

  AMBIENT_TEMP: {
    name: 'AMBIENT_TEMP',
    pid: '0146',
    description: 'Ambient air temperature',
    decoder: (data: string) => {
      const bytes = extractDataBytes(data, '0146');
      return bytes.length >= 1 ? hexToDec(bytes[0]!) - 40 : 0;
    },
    unit: '°C',
  },

  // Note: VIN uses ISO-TP multiframe — not fully supported on cheap clones.
  // Best handled with proper frame reassembly.
  VIN: {
    name: 'VIN',
    pid: '0902',
    description: 'Vehicle Identification Number (multiframe — limited support on clones)',
    decoder: (data: string) => {
      const cleaned = data.toUpperCase().replace(/4902[\dA-F]{2}/g, '');
      const bytes: string[] = [];
      for (let i = 0; i + 1 < cleaned.length; i += 2) {
        const b = cleaned.substring(i, i + 2);
        if (/^[0-9A-F]{2}$/.test(b)) bytes.push(b);
      }
      const vin = bytes
        .map((b) => String.fromCharCode(hexToDec(b)))
        .join('')
        .replace(/[^\x20-\x7E]/g, '')
        .trim();
      return vin || 'VIN not available';
    },
    unit: 'STRING',
  },
};

/**
 * Looks up an OBD2 command by its PID string.
 */
export function getCommandByPid(pid: string): OBD2Command | undefined {
  return Object.values(OBD2_COMMANDS).find((cmd) => cmd.pid.toUpperCase() === pid.toUpperCase());
}

/**
 * Returns all predefined OBD2 commands.
 * Returns copies to prevent accidental mutation.
 */
export function getAllCommands(): OBD2Command[] {
  return Object.values(OBD2_COMMANDS).map((cmd) => ({ ...cmd }));
}

/**
 * Returns commands filtered by category (MODE_01 or MODE_09).
 * Returns copies to prevent accidental mutation.
 */
export function getCommandsByCategory(category: string): OBD2Command[] {
  if (category === 'MODE_01') {
    return Object.values(OBD2_COMMANDS)
      .filter((cmd) => cmd.pid.startsWith('01'))
      .map((cmd) => ({ ...cmd }));
  }
  if (category === 'MODE_09') {
    return Object.values(OBD2_COMMANDS)
      .filter((cmd) => cmd.pid.startsWith('09'))
      .map((cmd) => ({ ...cmd }));
  }
  return [];
}
