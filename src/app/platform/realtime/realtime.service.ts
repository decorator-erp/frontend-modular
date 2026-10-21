import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import {
  HubConnection,
  HubConnectionBuilder,
  IHttpConnectionOptions,
  LogLevel,
} from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { TokenService } from '../auth/token.service';

export type RealtimeStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Factory seam for building the hub connection — overridable in tests (no module mocking). */
export type HubConnectionFactory = (url: string, options: IHttpConnectionOptions) => HubConnection;

export const HUB_CONNECTION_FACTORY = new InjectionToken<HubConnectionFactory>(
  'HUB_CONNECTION_FACTORY',
  {
    providedIn: 'root',
    factory: () => (url, options) =>
      new HubConnectionBuilder()
        .withUrl(url, options)
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Warning)
        .build(),
  },
);

/**
 * Generic SignalR connection owner (constitution: core is generic, no domain knowledge).
 * Owns exactly one `HubConnection` to the notifications hub. Domain features register their
 * server-callback handlers via `on()` and a resync handler via `onReconnected()`; the
 * `NotificationStore` wires those in its `onInit` (registration precedes `start()` — no race).
 *
 * Auth: the hub authorizes ONLY via `?access_token=` query string, so we pass an
 * `accessTokenFactory` that reads the CURRENT token on every (re)connect — this is what makes
 * reconnect-after-token-refresh work automatically.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly tokenService = inject(TokenService);
  private readonly createConnection = inject(HUB_CONNECTION_FACTORY);

  private connection: HubConnection | null = null;
  /** Handlers registered (possibly before the connection is built) — re-attached on every start. */
  private readonly methodHandlers = new Map<string, ((payload: unknown) => void)[]>();
  private readonly reconnectedHandlers = new Set<() => void>();

  readonly status = signal<RealtimeStatus>('disconnected');

  /** Build (if needed) and start the connection. Idempotent while already started/starting. */
  async start(): Promise<void> {
    if (this.connection) {
      return;
    }

    const connection = this.createConnection(`${environment.hubUrl}/notifications`, {
      accessTokenFactory: () => this.tokenService.getToken() ?? '',
    });

    // Re-attach any handlers registered before this connection existed (register-before-start).
    this.methodHandlers.forEach((handlers, method) =>
      handlers.forEach((handler) => connection.on(method, handler)),
    );

    connection.onreconnecting(() => this.status.set('reconnecting'));
    connection.onreconnected(() => {
      this.status.set('connected');
      this.reconnectedHandlers.forEach((handler) => handler());
    });
    connection.onclose(() => this.status.set('disconnected'));

    this.connection = connection;
    this.status.set('connecting');
    try {
      await connection.start();
      this.status.set('connected');
    } catch {
      this.status.set('disconnected');
      // Automatic reconnect handles transient drops; a hard initial failure leaves us
      // disconnected — the auth effect will retry start() on the next auth signal.
      this.connection = null;
    }
  }

  /** Stop and tear down the connection (e.g. on logout). Safe to call when not connected. */
  async stop(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    this.status.set('disconnected');
    if (connection) {
      await connection.stop().catch(() => undefined);
    }
  }

  /** Register a server→client callback. Works before or after `start()`; survives reconnects. */
  on<T>(method: string, handler: (payload: T) => void): void {
    const typed = handler as (payload: unknown) => void;
    const list = this.methodHandlers.get(method) ?? [];
    list.push(typed);
    this.methodHandlers.set(method, list);
    this.connection?.on(method, typed);
  }

  /** Register a handler invoked after the connection automatically reconnects (resync hook). */
  onReconnected(handler: () => void): void {
    this.reconnectedHandlers.add(handler);
  }
}
