import type { LiveEventType, TikTokIntegrationStatus } from '../src/types/platform.js';

export interface IncomingLiveStreamEvent {
  type: LiveEventType;
  senderUsername: string;
  giftName?: string;
  giftCount?: number;
  commentText?: string;
  likeCount?: number;
}

export type LiveEventHandler = (userId: string, event: IncomingLiveStreamEvent) => void | Promise<void>;

export interface LiveStreamProvider {
  readonly providerName: string;
  setEventCallback(handler: LiveEventHandler): void;
  getStatus(userId: string): TikTokIntegrationStatus;
  connect(userId: string, username: string): Promise<TikTokIntegrationStatus>;
  disconnect(userId: string): Promise<TikTokIntegrationStatus>;
}

const DOCUMENTATION_NOTE =
  'O TikTok LIVE não fornece uma API WebSocket pública oficial sem aprovação de parceiro. Esta arquitetura separa o provedor de captura: em produção, conecte a biblioteca comunitária tiktok-live-connector em um worker Node.js dedicado ou configure TIKTOK_CONNECTOR_MODE. Nenhum status conectado falso é exibido sem conexão real.';

class ModularTikTokLiveProvider implements LiveStreamProvider {
  readonly providerName = 'TikTok LIVE Adapter (Desacoplado)';
  private states = new Map<string, TikTokIntegrationStatus>();
  private activeConnectors = new Map<string, { disconnect?: () => void }>();
  private eventHandler: LiveEventHandler | null = null;

  setEventCallback(handler: LiveEventHandler): void {
    this.eventHandler = handler;
  }

  private emitIncomingEvent(userId: string, payload: IncomingLiveStreamEvent): void {
    this.recordEvent(userId);
    if (this.eventHandler) {
      Promise.resolve(this.eventHandler(userId, payload)).catch((err) => {
        console.warn('Erro ao processar evento TikTok LIVE recebido:', err);
      });
    }
  }

  private defaultState(): TikTokIntegrationStatus {
    return {
      providerName: this.providerName,
      status: 'disconnected',
      connectedUsername: null,
      lastError: null,
      requiresExternalConnector: true,
      documentationNote: DOCUMENTATION_NOTE,
      eventsReceivedSession: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  getStatus(userId: string): TikTokIntegrationStatus {
    return this.states.get(userId) ?? this.defaultState();
  }

  recordEvent(userId: string): void {
    const current = this.getStatus(userId);
    current.eventsReceivedSession += 1;
    current.updatedAt = new Date().toISOString();
    this.states.set(userId, current);
  }

  async connect(userId: string, rawUsername: string): Promise<TikTokIntegrationStatus> {
    const cleanHandle = rawUsername.trim().replace(/^@+/, '');
    if (!cleanHandle || !/^[a-zA-Z0-9_.]{2,32}$/.test(cleanHandle)) {
      const errState: TikTokIntegrationStatus = {
        ...this.defaultState(),
        status: 'error',
        lastError: 'Informe um @usuario válido do TikTok (2 a 32 caracteres).',
      };
      this.states.set(userId, errState);
      return errState;
    }

    // Disconnect previous connector for this user if present
    await this.disconnect(userId);

    // Attempt optional dynamic load of community library 'tiktok-live-connector' if user installs it.
    // Never fabricate a fake connected state when the connector or active live room is absent.
    try {
      const moduleName = 'tiktok-live-connector';
      const mod = await import(/* @vite-ignore */ moduleName).catch(() => null);
      if (!mod || !mod.WebcastPushConnection) {
        const missingState: TikTokIntegrationStatus = {
          ...this.defaultState(),
          status: 'disconnected',
          connectedUsername: null,
          lastError:
            'Conector real "tiktok-live-connector" não instalado neste ambiente. Instale o pacote em um worker Node.js ou use o Modo Simulação em Eventos LIVE para testar suas regras.',
        };
        this.states.set(userId, missingState);
        return missingState;
      }

      const connection = new mod.WebcastPushConnection(cleanHandle, {
        processInitialData: false,
      });

      if (typeof connection.on === 'function') {
        connection.on('gift', (data: Record<string, unknown>) => {
          const giftName = String(data?.giftName || data?.describe || 'Presente');
          const count = Math.max(1, Number(data?.repeatCount || data?.giftCount || 1));
          const sender = String(data?.uniqueId || data?.nickname || 'espectador');
          // Wait until streak ends when giftType === 1 & repeatEnd === false to avoid duplicate fire
          if (data?.giftType === 1 && data?.repeatEnd === false) return;
          this.emitIncomingEvent(userId, {
            type: 'gift',
            senderUsername: sender,
            giftName,
            giftCount: count,
          });
        });

        connection.on('chat', (data: Record<string, unknown>) => {
          const sender = String(data?.uniqueId || data?.nickname || 'espectador');
          const commentText = String(data?.comment || '');
          this.emitIncomingEvent(userId, {
            type: 'comment',
            senderUsername: sender,
            commentText,
          });
        });

        connection.on('like', (data: Record<string, unknown>) => {
          const sender = String(data?.uniqueId || data?.nickname || 'espectador');
          const likeCount = Math.max(1, Number(data?.likeCount || 1));
          this.emitIncomingEvent(userId, {
            type: 'like',
            senderUsername: sender,
            likeCount,
          });
        });

        connection.on('follow', (data: Record<string, unknown>) => {
          const sender = String(data?.uniqueId || data?.nickname || 'espectador');
          this.emitIncomingEvent(userId, {
            type: 'follow',
            senderUsername: sender,
          });
        });

        connection.on('share', (data: Record<string, unknown>) => {
          const sender = String(data?.uniqueId || data?.nickname || 'espectador');
          this.emitIncomingEvent(userId, {
            type: 'share',
            senderUsername: sender,
          });
        });

        connection.on('streamEnd', () => {
          this.activeConnectors.delete(userId);
          this.states.set(userId, {
            ...this.defaultState(),
            status: 'disconnected',
            connectedUsername: null,
            lastError: `A live de @${cleanHandle} foi encerrada.`,
          });
        });

        connection.on('disconnected', () => {
          this.activeConnectors.delete(userId);
        });
      }

      await connection.connect();
      this.activeConnectors.set(userId, connection);
      const connectedState: TikTokIntegrationStatus = {
        ...this.defaultState(),
        status: 'connected',
        connectedUsername: cleanHandle,
        lastError: null,
        requiresExternalConnector: false,
      };
      this.states.set(userId, connectedState);
      return connectedState;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao conectar à transmissão ao vivo.';
      const failState: TikTokIntegrationStatus = {
        ...this.defaultState(),
        status: 'error',
        connectedUsername: null,
        lastError: `Não foi possível conectar a @${cleanHandle}: ${message}`,
      };
      this.states.set(userId, failState);
      return failState;
    }
  }

  async disconnect(userId: string): Promise<TikTokIntegrationStatus> {
    const conn = this.activeConnectors.get(userId);
    if (conn && typeof conn.disconnect === 'function') {
      try {
        conn.disconnect();
      } catch {
        // ignore close errors
      }
    }
    this.activeConnectors.delete(userId);
    const next = this.defaultState();
    this.states.set(userId, next);
    return next;
  }
}

export const tiktokProvider = new ModularTikTokLiveProvider();
