import type { SoftieEvent } from "../core/event-bus.js";
import { eventBus } from "../core/event-bus.js";

// Minimal WebSocket interface — compatible with `ws` WebSocket instances
interface WsSocket {
  readyState: number;
  send(data: string): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

const WS_OPEN = 1;

export class WsHub {
  private clients = new Set<WsSocket>();

  constructor() {
    // Forward all EventBus events to connected WS clients
    eventBus.on("*", (event: SoftieEvent) => {
      this.broadcast({ type: "event", data: event });
    });
  }

  addClient(socket: WsSocket): void {
    this.clients.add(socket);
    socket.on("close", () => {
      this.clients.delete(socket);
    });
  }

  broadcast(message: Record<string, unknown>): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WS_OPEN) {
        try {
          client.send(data);
        } catch {
          this.clients.delete(client);
        }
      }
    }
  }

  broadcastEvent(event: SoftieEvent): void {
    this.broadcast({ type: "event", data: event });
  }

  get clientCount(): number {
    return this.clients.size;
  }
}
