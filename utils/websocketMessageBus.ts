export class WebSocketMessageBus<T extends { MessageType: string }> {
  private listeners = new Map<string, Set<(message: T) => void>>();
  constructor(private onError: (error: unknown) => void = () => {}) {}
  subscribe(type: string, handler: (message: T) => void) {
    let handlers = this.listeners.get(type);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(type, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
      if (!handlers.size && this.listeners.get(type) === handlers)
        this.listeners.delete(type);
    };
  }
  dispatch(message: T) {
    const handlers = new Set([
      ...(this.listeners.get(message.MessageType) ?? []),
      ...(this.listeners.get("*") ?? []),
    ]);
    for (const handler of handlers) {
      try {
        handler(message);
      } catch (error) {
        this.onError(error);
      }
    }
  }
}
