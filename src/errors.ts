export class OBD2Error extends Error {
  public code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'OBD2Error';
    this.code = code;
  }
}

export class ConnectionError extends OBD2Error {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
  }
}

export class TimeoutError extends OBD2Error {
  constructor(message: string) {
    super(message, 'TIMEOUT_ERROR');
  }
}

export class ProtocolError extends OBD2Error {
  constructor(message: string) {
    super(message, 'PROTOCOL_ERROR');
  }
}
