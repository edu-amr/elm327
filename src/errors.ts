export class OBD2Error extends Error {
  constructor(
    message: string,
    public readonly code: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ConnectionError extends OBD2Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 'CONNECTION_ERROR', options);
  }
}

export class TimeoutError extends OBD2Error {
  constructor(message: string) {
    super(message, 'TIMEOUT_ERROR');
  }
}

export class ProtocolError extends OBD2Error {
  constructor(message: string, code = 'PROTOCOL_ERROR') {
    super(message, code);
  }
}

/** The vehicle answered "NO DATA": the PID is unsupported or the ECU is silent. */
export class NoDataError extends ProtocolError {
  constructor(message = 'NO DATA') {
    super(message, 'NO_DATA');
  }
}

/** The ECU rejected the request with a negative response (service 0x7F). */
export class NegativeResponseError extends ProtocolError {
  constructor(
    public readonly nrc: number,
    message: string,
  ) {
    super(message, 'NEGATIVE_RESPONSE');
  }
}

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
