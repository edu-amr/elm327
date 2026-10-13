import { NoDataError, errorMessage } from '../errors';
import type { AdapterInfo, ConnectionConfig } from '../types';
import type { Adapter } from './adapter';

const ATZ_ATTEMPTS = 3;
const DETECT_TIMEOUT_MS = 20000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const isCanProtocol = (description: string): boolean => /CAN/i.test(description);

/** Reads the adapter input voltage (ATRV), e.g. "12.6V" -> 12.6. */
export async function readVoltage(adapter: Adapter): Promise<number | undefined> {
  const [line] = await adapter.send('ATRV');
  const volts = Number.parseFloat(line ?? '');
  return Number.isNaN(volts) ? undefined : volts;
}

/**
 * Triggers protocol detection with a real request, then configures header
 * printing to match the protocol: CAN needs headers for ISO-TP reassembly,
 * other protocols are simpler without them.
 */
export async function detectVehicle(
  adapter: Adapter,
  timeoutMs = DETECT_TIMEOUT_MS,
): Promise<Pick<AdapterInfo, 'protocol' | 'can' | 'vehicleConnected'>> {
  let vehicleConnected = true;
  try {
    await adapter.send('0100', timeoutMs);
  } catch (error) {
    vehicleConnected = error instanceof NoDataError;
  }

  const [description = ''] = await adapter.send('ATDP');
  const protocol = description.replace(/^AUTO,\s*/, '');
  const can = !vehicleConnected || isCanProtocol(protocol);

  await adapter.send(can ? 'ATH1' : 'ATH0');
  adapter.headers = can;
  return { protocol, can, vehicleConnected };
}

/**
 * Brings an adapter to a known state. Sequence follows python-OBD and the
 * ELM327 datasheet: reset, echo/linefeed/spacing, protocol, detection.
 */
export async function initialize(adapter: Adapter, config: ConnectionConfig): Promise<AdapterInfo> {
  const mode = config.cloneCompatibility ?? 'auto';
  const strict = mode === 'strict';
  const minimal = mode === 'minimal';
  let relaxed = mode === 'lenient' || minimal;
  const timeout = config.timeout ?? 5000;

  const optional = async (command: string): Promise<void> => {
    try {
      await adapter.send(command);
    } catch (error) {
      if (strict) throw error;
    }
    await sleep(relaxed ? 200 : 30);
  };

  await resetAdapter(adapter, Math.max(timeout, 5000));
  await optional('ATE0');

  const [versionLine = 'Unknown'] = await adapter.send('ATI').catch(() => ['Unknown']);
  if (mode === 'auto' && /v1\.[0-5]/i.test(versionLine)) relaxed = true;

  if (!minimal) {
    for (const command of [
      'ATL0',
      'ATS1',
      'ATH1',
      'ATCAF1',
      'ATAT1',
      relaxed ? 'ATSTFF' : 'ATST64',
    ]) {
      await optional(command);
    }
  }

  const device = await adapter.send('AT@1').then(
    ([line]) => line ?? 'Unknown',
    () => 'Unknown',
  );
  await adapter.send('ATSP' + (config.protocol ?? '0'));
  if (!minimal) await applyFlowControl(config, optional);

  let detected;
  try {
    detected = await detectVehicle(adapter);
  } catch (error) {
    if (strict) throw error;
    detected = { protocol: 'Unknown', can: true, vehicleConnected: false };
  }

  return { version: versionLine, device, ...detected };
}

async function resetAdapter(adapter: Adapter, timeoutMs: number): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATZ_ATTEMPTS; attempt++) {
    try {
      await adapter.send('ATZ', timeoutMs);
      return;
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }
  throw new Error(`Adapter did not answer ATZ: ${errorMessage(lastError)}`);
}

async function applyFlowControl(
  { flowControl }: ConnectionConfig,
  optional: (command: string) => Promise<void>,
): Promise<void> {
  if (!flowControl) return;
  if (flowControl.header) await optional(`ATFCSH${flowControl.header}`);
  if (flowControl.data) await optional(`ATFCSD${flowControl.data}`);
  if (flowControl.mode !== undefined) await optional(`ATFCSM${flowControl.mode}`);
}
