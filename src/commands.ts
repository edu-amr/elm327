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
  const expectedPrefix =
    (parseInt(mode, 16) + 0x40).toString(16).toUpperCase() + commandPid.substring(2).toUpperCase();

  let data = response.toUpperCase();

  if (data.startsWith(expectedPrefix)) {
    data = data.substring(expectedPrefix.length);
  } else if (data.length > 4) {
    data = data.substring(4);
  }

  const bytes: string[] = [];
  for (let i = 0; i + 1 < data.length; i += 2) {
    const byte = data.substring(i, i + 2);
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
    decoder: (data: string) => (data.length >= 4 ? data.substring(4) : data),
    unit: 'BIT',
  },

  DTC_STATUS: {
    name: 'DTC_STATUS',
    pid: '0101',
    description: 'DTC status since last clearing',
    decoder: (data: string) => (data.length >= 4 ? data.substring(4) : data),
    unit: 'BIT',
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
    description: 'OBD standards the vehicle conforms to',
    decoder: (data: string) => {
      const standards: Record<number, string> = {
        1: 'OBD-II (CARB)',
        2: 'OBD (EPA)',
        3: 'OBD + OBD-II',
        4: 'OBD-I',
        5: 'Not OBD compliant',
        6: 'EOBD (Europe)',
        7: 'EOBD + OBD-II',
        10: 'JOBD (Japan)',
      };
      const bytes = extractDataBytes(data, '011C');
      const value = bytes.length >= 1 ? hexToDec(bytes[0]!) : 0;
      return standards[value] || `Unknown (${value})`;
    },
    unit: 'STRING',
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
 */
export function getAllCommands(): OBD2Command[] {
  return Object.values(OBD2_COMMANDS);
}

/**
 * Returns commands filtered by category (MODE_01 or MODE_09).
 */
export function getCommandsByCategory(category: string): OBD2Command[] {
  if (category === 'MODE_01') {
    return Object.values(OBD2_COMMANDS).filter((cmd) => cmd.pid.startsWith('01'));
  }
  if (category === 'MODE_09') {
    return Object.values(OBD2_COMMANDS).filter((cmd) => cmd.pid.startsWith('09'));
  }
  return [];
}
