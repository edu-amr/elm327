import { OBD2Client } from '../obd2-client';
import { ConnectionConfig } from '../types';

describe('OBD2Client', () => {
  let client: OBD2Client;
  const mockConfig: ConnectionConfig = {
    type: 'serial',
    port: '/dev/ttyUSB0',
    baudRate: 38400,
  };

  beforeEach(() => {
    client = new OBD2Client(mockConfig);
  });

  afterEach(async () => {
    if (client.isConnected()) {
      await client.disconnect();
    }
  });

  describe('constructor', () => {
    it('should create a new OBD2Client instance', () => {
      expect(client).toBeInstanceOf(OBD2Client);
    });

    it('should not be connected initially', () => {
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('getAvailableCommands', () => {
    it('should return an array of available command names', () => {
      const commands = client.getAvailableCommands();
      expect(Array.isArray(commands)).toBe(true);
      expect(commands.length).toBeGreaterThan(0);
      expect(commands).toContain('ENGINE_RPM');
      expect(commands).toContain('VEHICLE_SPEED');
      expect(commands).toContain('COOLANT_TEMP');
    });
  });

  describe('connection management', () => {
    it('should throw error when querying without connection', async () => {
      await expect(client.query('ENGINE_RPM')).rejects.toThrow('Adapter not initialized. Call connect() first.');
    });

    it('should throw error for unknown command', async () => {
      // Mock connection and isInitialized
      (client as any).connection = {
        getConnectionStatus: () => true,
        disconnect: async () => {},
      };
      (client as any).isInitialized = true;

      await expect(client.query('UNKNOWN_COMMAND')).rejects.toThrow(
        'Unknown command: UNKNOWN_COMMAND',
      );
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      // Mock connection and isInitialized
      (client as any).connection = {
        getConnectionStatus: () => true,
        disconnect: async () => {},
      };
      (client as any).isInitialized = true;

      jest.spyOn(client, 'query').mockImplementation(async (command: any) => {
        const mockResponses: Record<string, any> = {
          ENGINE_RPM: { command: 'ENGINE_RPM', value: 2500, unit: 'rpm', timestamp: new Date() },
          VEHICLE_SPEED: {
            command: 'VEHICLE_SPEED',
            value: 60,
            unit: 'km/h',
            timestamp: new Date(),
          },
          COOLANT_TEMP: { command: 'COOLANT_TEMP', value: 85, unit: '°C', timestamp: new Date() },
          ENGINE_LOAD: { command: 'ENGINE_LOAD', value: 45, unit: '%', timestamp: new Date() },
          FUEL_LEVEL: { command: 'FUEL_LEVEL', value: 75, unit: '%', timestamp: new Date() },
          THROTTLE_POS: { command: 'THROTTLE_POS', value: 25, unit: '%', timestamp: new Date() },
        };

        return mockResponses[command as string] || { command, value: 0, timestamp: new Date() };
      });
    });

    it('should get RPM', async () => {
      const rpm = await client.getRPM();
      expect(rpm).toBe(2500);
    });

    it('should get speed', async () => {
      const speed = await client.getSpeed();
      expect(speed).toBe(60);
    });

    it('should get coolant temperature', async () => {
      const temp = await client.getCoolantTemperature();
      expect(temp).toBe(85);
    });

    it('should get engine load', async () => {
      const load = await client.getEngineLoad();
      expect(load).toBe(45);
    });

    it('should get fuel level', async () => {
      const fuel = await client.getFuelLevel();
      expect(fuel).toBe(75);
    });

    it('should get throttle position', async () => {
      const throttle = await client.getThrottlePosition();
      expect(throttle).toBe(25);
    });
  });

  describe('scanPids events', () => {
    beforeEach(async () => {
      // Setup connected client with mocked connection
      const mockConnection = {
        sendCommand: jest.fn().mockResolvedValue('41 0C 1A F8'),
        sendDiagnosticRequest: jest.fn().mockResolvedValue({
          success: true,
          mode: 0x01,
          pid: 0x0C,
          value: 0x1AF8,
          timestamp: new Date(),
        }),
        initialize: jest.fn().mockResolvedValue({
          version: 'ELM327 v2.1',
          device: 'Test Adapter',
          protocol: 'ISO 15765-4 (CAN 11/500)',
        }),
        on: jest.fn(),
        removeAllListeners: jest.fn(),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isConnectionOpen: jest.fn().mockReturnValue(true),
        sendRaw: jest.fn(),
        getConnectionStatus: jest.fn().mockReturnValue(true),
      };
      (client as any).connection = mockConnection;
      (client as any).isInitialized = true;
      (client as any).adapterInfo = {
        version: 'ELM327 v2.1',
        device: 'Test Adapter',
        protocol: 'ISO 15765-4 (CAN 11/500)',
      };
    });

    it('should emit scanProgress events during scanPids', async () => {
      const progressEvents: Array<{ pid: number; response: any }> = [];

      client.on('scanProgress', (data) => {
        progressEvents.push(data);
      });

      await client.scanPids(0x01, 0x00, 0x05);

      // Should have emitted progress for each PID (0x00 to 0x04)
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[0]).toHaveProperty('pid');
      expect(progressEvents[0]).toHaveProperty('response');
    });

    it('should emit scanComplete event when scan finishes', async () => {
      let completeData: any = null;

      client.on('scanComplete', (data) => {
        completeData = data;
      });

      await client.scanPids(0x01, 0x00, 0x03);

      expect(completeData).not.toBeNull();
      expect(completeData).toHaveProperty('totalScanned');
      expect(completeData).toHaveProperty('found');
      expect(completeData).toHaveProperty('results');
    });
  });
});
