import type { LiveEventType, TikTokIntegrationStatus } from '../src/types/platform';

export interface IncomingLiveStreamEvent {
  type: LiveEventType;
  senderUsername: string;
  giftName?: string;
  giftCount?: number;
  commentText?: string;
  likeCount?: number;
}

export interface LiveStreamProvider {
  readonly providerName: string;
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
