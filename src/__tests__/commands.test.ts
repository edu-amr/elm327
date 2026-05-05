import { OBD2_COMMANDS } from '../commands';

describe('OBD2 Commands', () => {
  it('should have all essential commands defined', () => {
    expect(OBD2_COMMANDS.ENGINE_RPM).toBeDefined();
    expect(OBD2_COMMANDS.VEHICLE_SPEED).toBeDefined();
    expect(OBD2_COMMANDS.COOLANT_TEMP).toBeDefined();
    expect(OBD2_COMMANDS.ENGINE_LOAD).toBeDefined();
    expect(OBD2_COMMANDS.FUEL_LEVEL).toBeDefined();
    expect(OBD2_COMMANDS.THROTTLE_POS).toBeDefined();
  });

  describe('ENGINE_RPM decoder', () => {
    it('should decode RPM correctly', () => {
      const command = OBD2_COMMANDS.ENGINE_RPM!;
      // Mock response: "410C1B78" (RPM = (0x1B * 256 + 0x78) / 4 = 1758)
      const result = command.decoder('410C1B78');
      expect(result).toBe(1758);
    });
  });

  describe('VEHICLE_SPEED decoder', () => {
    it('should decode speed correctly', () => {
      const command = OBD2_COMMANDS.VEHICLE_SPEED!;
      // Mock response: "410D3C" (Speed = 0x3C = 60 km/h)
      const result = command.decoder('410D3C');
      expect(result).toBe(60);
    });
  });

  describe('COOLANT_TEMP decoder', () => {
    it('should decode coolant temperature correctly', () => {
      const command = OBD2_COMMANDS.COOLANT_TEMP!;
      // Mock response: "41057D" (Temp = 0x7D - 40 = 125 - 40 = 85°C)
      const result = command.decoder('41057D');
      expect(result).toBe(85);
    });
  });

  describe('ENGINE_LOAD decoder', () => {
    it('should decode engine load correctly', () => {
      const command = OBD2_COMMANDS.ENGINE_LOAD!;
      // Mock response: "410480" (Load = 0x80 * 100 / 255 ≈ 50.2%)
      const result = command.decoder('410480');
      expect(Math.round(result as number)).toBe(50);
    });
  });

  describe('THROTTLE_POS decoder', () => {
    it('should decode throttle position correctly', () => {
      const command = OBD2_COMMANDS.THROTTLE_POS!;
      // Mock response: "411140" (Pos = 0x40 * 100 / 255 ≈ 25.1%)
      const result = command.decoder('411140');
      expect(Math.round(result as number)).toBe(25);
    });
  });

  describe('MAF_RATE decoder', () => {
    it('should decode MAF rate correctly', () => {
      const command = OBD2_COMMANDS.MAF_RATE!;
      // Mock response: "41101234" (MAF = (0x12 * 256 + 0x34) / 100 = 46.6)
      const result = command.decoder('41101234');
      expect(result).toBe(46.6);
    });
  });
});
