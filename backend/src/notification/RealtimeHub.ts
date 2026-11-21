import { Response } from 'express';

/**
 * Real-time push using Server-Sent Events. Each logged-in browser keeps one
 * open connection; the hub pushes notifications to a user and broadcasts
 * "incident changed" events so dashboards refresh live.
 */
export class RealtimeHub {
  private readonly clients = new Map<string, Set<Response>>();

  connect(userId: string, res: Response): () => void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`event: connected\ndata: {}\n\n`);
    if (!this.clients.has(userId)) this.clients.set(userId, new Set());
    this.clients.get(userId)!.add(res);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    return () => {
      clearInterval(heartbeat);
      this.clients.get(userId)?.delete(res);
      if (this.clients.get(userId)?.size === 0) this.clients.delete(userId);
    };
  }

  sendToUser(userId: string, event: string, data: unknown): void {
    const conns = this.clients.get(userId);
    if (!conns) return;
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    conns.forEach((res) => res.write(frame));
  }

  broadcast(event: string, data: unknown): void {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.clients.forEach((conns) => conns.forEach((res) => res.write(frame)));
  }

  connectedUsers(): number {
    return this.clients.size;
  }
}
