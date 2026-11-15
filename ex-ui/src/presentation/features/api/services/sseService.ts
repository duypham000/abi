let es: EventSource | null = null;
let namedListeners: Array<{ type: string; handler: EventListenerOrEventListenerObject }> = [];

export const sseService = {
  connect(
    url: string,
    callbacks: {
      onOpen: () => void;
      onMessage: (data: string, event: string) => void;
      onError: () => void;
    }
  ) {
    sseService.disconnect();

    es = new EventSource(url);

    es.onopen = callbacks.onOpen;
    es.onmessage = (e) => callbacks.onMessage(e.data, "message");
    es.onerror = () => {
      if (es?.readyState === EventSource.CLOSED) {
        callbacks.onError();
      }
    };
  },

  addNamedListener(eventType: string, handler: (data: string) => void) {
    if (!es) return;
    const listener = (e: Event) => {
      handler((e as MessageEvent).data);
    };
    es.addEventListener(eventType, listener);
    namedListeners.push({ type: eventType, handler: listener });
  },

  get source() {
    return es;
  },

  disconnect() {
    if (es) {
      namedListeners.forEach(({ type, handler }) => {
        es?.removeEventListener(type, handler);
      });
      namedListeners = [];
      es.close();
      es = null;
    }
  },
};
