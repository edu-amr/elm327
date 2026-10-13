import { EventEmitter } from 'node:events';
import { ConnectionError, NoDataError, TimeoutError } from '../errors';
import type { Transport } from '../transport/transport';
import { Adapter } from './adapter';

class FakeTransport extends EventEmitter implements Transport {
  isOpen = true;
  written: string[] = [];
  respond: (command: string) => string | undefined = () => undefined;

  async open(): Promise<void> {}
  async close(): Promise<void> {
    this.isOpen = false;
    this.emit('close');
  }
  async write(data: string): Promise<void> {
    this.written.push(data);
    const reply = this.respond(data.replace(/\r$/, ''));
    if (reply !== undefined) setImmediate(() => this.emit('data', reply));
  }
}

const setup = (timeout = 200) => {
  const transport = new FakeTransport();
  return { transport, adapter: new Adapter(transport, timeout) };
};

describe('Adapter', () => {
  it('returns response lines without the prompt, echo or SEARCHING noise', async () => {
    const { transport, adapter } = setup();
    transport.respond = () => '010C\rSEARCHING...\r41 0C 1A F8\r\r>';
    expect(await adapter.send('010C')).toEqual(['41 0C 1A F8']);
  });

  it('reassembles responses split across chunks', async () => {
    const { transport, adapter } = setup();
    transport.respond = () => {
      setImmediate(() => transport.emit('data', '41 0C '));
      setImmediate(() => transport.emit('data', '1A F8\r\r>'));
      return undefined;
    };
    expect(await adapter.send('010C')).toEqual(['41 0C 1A F8']);
  });

  it('maps adapter error lines to typed errors', async () => {
    const { transport, adapter } = setup();
    transport.respond = () => 'NO DATA\r\r>';
    await expect(adapter.send('0105')).rejects.toBeInstanceOf(NoDataError);
  });

  it('serializes concurrent commands in order', async () => {
    const { transport, adapter } = setup();
    transport.respond = (command) => `${command}-OK\r\r>`;
    const results = await Promise.all([adapter.send('A'), adapter.send('B'), adapter.send('C')]);
    expect(results).toEqual([['A-OK'], ['B-OK'], ['C-OK']]);
    expect(transport.written).toEqual(['A\r', 'B\r', 'C\r']);
  });

  it('times out, then discards the late reply instead of mixing it into the next command', async () => {
    const { transport, adapter } = setup(30);
    transport.respond = (command) => {
      if (command === 'SLOW') {
        setTimeout(() => transport.emit('data', 'LATE\r\r>'), 60);
        return undefined;
      }
      return `${command}-OK\r\r>`;
    };

    await expect(adapter.send('SLOW')).rejects.toBeInstanceOf(TimeoutError);
    expect(await adapter.send('NEXT')).toEqual(['NEXT-OK']);
  });

  it('keeps working after a failed command', async () => {
    const { transport, adapter } = setup();
    transport.respond = (command) => (command === 'BAD' ? '?\r\r>' : `${command}\r\r>`);
    await expect(adapter.send('BAD')).rejects.toThrow('Adapter error');
    await expect(adapter.send('GOOD')).resolves.toEqual([]);
  });

  it('rejects when the transport is closed', async () => {
    const { transport, adapter } = setup();
    transport.isOpen = false;
    await expect(adapter.send('ATI')).rejects.toBeInstanceOf(ConnectionError);
  });

  it('emits traffic and exchange events', async () => {
    const { transport, adapter } = setup();
    transport.respond = () => '41 05 7B\r\r>';
    const traffic: string[] = [];
    const exchanges: boolean[] = [];
    adapter.on('traffic', (t) => traffic.push(`${t.direction}:${t.data}`));
    adapter.on('exchange', (e) => exchanges.push(e.ok));
    await adapter.send('0105');
    expect(traffic).toEqual(['tx:0105', 'rx:41 05 7B']);
    expect(exchanges).toEqual([true]);
  });

  it('streams monitor frames and leaves monitor mode on escape', async () => {
    const { transport, adapter } = setup();
    transport.respond = (data) => {
      if (data === 'ATMA') setImmediate(() => transport.emit('data', '201 00 01\r201 00 0'));
      if (data === '\x1b') return '2\r\r>';
      return undefined;
    };
    const frames: string[] = [];
    adapter.on('frame', (f) => frames.push(f));

    await adapter.startMonitor();
    await new Promise((resolve) => setImmediate(resolve));
    await expect(adapter.send('ATI')).rejects.toBeInstanceOf(ConnectionError);
    await adapter.stopMonitor();

    expect(frames).toEqual(['201 00 01', '201 00 02']);
    expect(adapter.isMonitoring).toBe(false);
  });

  it('rejects a pending command immediately when the link closes', async () => {
    const { transport, adapter } = setup(5000);
    transport.respond = () => undefined;
    const pending = adapter.send('010C');
    setImmediate(() => void transport.close());
    const started = Date.now();
    await expect(pending).rejects.toBeInstanceOf(ConnectionError);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('does not throw when the transport errors and nobody listens', () => {
    const { transport } = setup();
    expect(() => transport.emit('error', new Error('ECONNRESET'))).not.toThrow();
  });
});
