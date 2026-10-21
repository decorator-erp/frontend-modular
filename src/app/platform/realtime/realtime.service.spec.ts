import { TestBed } from '@angular/core/testing';
import { HubConnection, IHttpConnectionOptions } from '@microsoft/signalr';
import { TokenService } from '../auth/token.service';
import { HUB_CONNECTION_FACTORY, HubConnectionFactory, RealtimeService } from './realtime.service';

/**
 * No module mocking — the connection is injected via HUB_CONNECTION_FACTORY, overridden here with
 * a fake. This is deterministic and isolated (module-mock races caused flakiness under the shared
 * Vitest module registry).
 */
class FakeConnection {
  handlers: Record<string, Array<(p: unknown) => void>> = {};
  private reconnected: Array<() => void> = [];
  constructor(public opts: IHttpConnectionOptions) {}
  on(method: string, cb: (p: unknown) => void): void {
    (this.handlers[method] ??= []).push(cb);
  }
  onreconnected(cb: () => void): void {
    this.reconnected.push(cb);
  }
  onreconnecting(): void {}
  onclose(): void {}
  start(): Promise<void> {
    return Promise.resolve();
  }
  stop(): Promise<void> {
    return Promise.resolve();
  }
  fireReconnected(): void {
    this.reconnected.forEach((cb) => cb());
  }
}

describe('RealtimeService', () => {
  let built: FakeConnection[];
  let currentToken: string | null;
  let svc: RealtimeService;

  beforeEach(() => {
    built = [];
    currentToken = 'tok-1';
    const factory: HubConnectionFactory = (_url, options) => {
      const conn = new FakeConnection(options);
      built.push(conn);
      return conn as unknown as HubConnection;
    };
    TestBed.configureTestingModule({
      providers: [
        RealtimeService,
        { provide: TokenService, useValue: { getToken: () => currentToken } },
        { provide: HUB_CONNECTION_FACTORY, useValue: factory },
      ],
    });
    svc = TestBed.inject(RealtimeService);
  });

  it('accessTokenFactory reads the CURRENT token on each call (survives refresh)', async () => {
    await svc.start();
    const factory = built.at(-1)!.opts.accessTokenFactory!;
    expect(factory()).toBe('tok-1');
    currentToken = 'tok-2';
    expect(factory()).toBe('tok-2');
  });

  it('invokes each registered reconnect handler exactly once on reconnected', async () => {
    let calls = 0;
    svc.onReconnected(() => calls++);
    await svc.start();
    built.at(-1)!.fireReconnected();
    expect(calls).toBe(1);
  });

  it('applies handlers registered BEFORE start (register-before-start, no race)', async () => {
    const received: unknown[] = [];
    svc.on('ReceiveNotification', (p) => received.push(p));
    await svc.start();
    built.at(-1)!.handlers['ReceiveNotification'].forEach((cb) => cb({ id: 'n1' }));
    expect(received).toEqual([{ id: 'n1' }]);
  });

  it('stop() then start() re-establishes a fresh connection with handlers re-attached', async () => {
    svc.on('ReceiveNotification', () => undefined);
    await svc.start();
    await svc.stop();
    await svc.start();
    expect(built).toHaveLength(2);
    expect(built[1].handlers['ReceiveNotification']).toHaveLength(1);
    expect(svc.status()).toBe('connected');
  });
});
