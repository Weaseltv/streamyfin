import { getSessionApi } from "@jellyfin/sdk/lib/utils/api";
import { useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useNetworkStatus } from "@/providers/NetworkStatusProvider";
import { getJellyfinHeaders, hasHeaders } from "@/utils/customHeaders";
import { getOrSetDeviceId } from "@/utils/device";
import { playbackRefreshQueue } from "@/utils/query/playbackRefresh";

interface WebSocketMessage {
  MessageType: string;
  Data: any;
  // Add other fields as needed
}

interface WebSocketProviderProps {
  children: ReactNode;
}

/**
 * Handler invoked for every message of a given `MessageType`. Receives the
 * message `Data` payload and the full message.
 */
type WebSocketMessageHandler = (data: any, message: WebSocketMessage) => void;

interface WebSocketContextType {
  ws: WebSocket | null;
  isConnected: boolean;
  /**
   * @deprecated Prefer `subscribe`. `lastMessage` only keeps the most recent
   * message, so bursts arriving in the same tick are coalesced and lost. Kept
   * for `useWebsockets` (GeneralCommand handling) until it is migrated.
   */
  lastMessage: WebSocketMessage | null;
  /**
   * Subscribe to a given message type. The handler is called synchronously for
   * every matching message (no coalescing, unlike `lastMessage`). Returns an
   * unsubscribe function to call on cleanup.
   */
  subscribe: (
    messageType: string,
    handler: WebSocketMessageHandler,
  ) => () => void;
  sendMessage: (message: any) => void;
  clearLastMessage: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

/** React Native's WebSocket constructor, which also takes request headers. */
type RNWebSocketConstructor = new (
  url: string,
  protocols: string[] | string | undefined,
  options: { headers: Record<string, string> },
) => WebSocket;

export const WebSocketProvider = ({ children }: WebSocketProviderProps) => {
  const api = useAtomValue(apiAtom);
  const { isConnected: isNetworkConnected } = useNetworkStatus();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const refreshQueue = playbackRefreshQueue(useQueryClient());
  const deviceId = useMemo(() => {
    return getOrSetDeviceId();
  }, []);
  const reconnectAttemptsRef = useRef(0);
  // Handle for the onerror backoff timer. Tracked so a reconnect triggered by
  // another path (foreground, network reconnect, effect re-run) can cancel a
  // pending one — an untracked timer would later open a second socket.
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Pub/sub registry: messageType -> set of handlers. Stored in a ref so
  // subscribing/dispatching never triggers a re-render.
  const listenersRef = useRef<Map<string, Set<WebSocketMessageHandler>>>(
    new Map(),
  );

  const subscribe = useCallback(
    (messageType: string, handler: WebSocketMessageHandler) => {
      const listeners = listenersRef.current;
      let handlers = listeners.get(messageType);
      if (!handlers) {
        handlers = new Set();
        listeners.set(messageType, handlers);
      }
      handlers.add(handler);
      return () => {
        handlers?.delete(handler);
        // Only drop the map entry if it still points at THIS set. After an
        // unsubscribe + re-subscribe for the same type, a stale second call to
        // this cleanup would otherwise delete the new subscribers' set and
        // silently stop delivering their messages.
        if (
          handlers &&
          handlers.size === 0 &&
          listeners.get(messageType) === handlers
        ) {
          listeners.delete(messageType);
        }
      };
    },
    [],
  );

  const dispatchMessage = useCallback((message: WebSocketMessage) => {
    const handlers = listenersRef.current.get(message.MessageType);
    if (!handlers || handlers.size === 0) return;
    // Copy to tolerate handlers that unsubscribe during dispatch.
    for (const handler of [...handlers]) {
      // Isolate each handler so one throwing subscriber can't abort the rest
      // (and isn't misreported as a parse failure by the outer onmessage catch).
      try {
        handler(message.Data, message);
      } catch (error) {
        console.error(
          `Error handling WebSocket message type "${message.MessageType}":`,
          error,
        );
      }
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    // Cancel any reconnect queued by a previous onerror before opening a new
    // socket, so we never end up with two live sockets — each would double the
    // message fan-out and double-invalidate queries.
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (!deviceId || !api?.accessToken || !isNetworkConnected) {
      return;
    }

    const protocol = api.basePath.includes("https") ? "wss" : "ws";
    const url = `${protocol}://${api.basePath
      .replace("https://", "")
      .replace("http://", "")}/socket?ApiKey=${
      api.accessToken
    }&deviceId=${deviceId}`;

    // React Native's WebSocket takes request headers as a third argument (the
    // DOM typings don't know about it), so a server behind an access gateway
    // can complete the upgrade handshake.
    const customHeaders = getJellyfinHeaders(api.basePath);
    const newWebSocket = hasHeaders(customHeaders)
      ? new (WebSocket as unknown as RNWebSocketConstructor)(url, undefined, {
          headers: customHeaders,
        })
      : new WebSocket(url);
    let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

    const maxReconnectAttempts = 5;
    const reconnectDelay = 10000;

    newWebSocket.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      keepAliveInterval = setInterval(() => {
        if (newWebSocket.readyState === WebSocket.OPEN) {
          newWebSocket.send(JSON.stringify({ MessageType: "KeepAlive" }));
        }
      }, 30000);
    };

    newWebSocket.onerror = () => {
      // Don't log errors - this is expected when offline or server unreachable
      setIsConnected(false);

      // Replace any still-pending reconnect so only one is ever queued; the
      // previously untracked handle could leak and open a second socket.
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connectWebSocket();
        }, reconnectDelay);
      }
    };

    newWebSocket.onclose = () => {
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
      setIsConnected(false);
    };
    newWebSocket.onmessage = (e) => {
      try {
        const message = JSON.parse(e.data);
        // Legacy single-slot state, still consumed by useWebsockets.
        setLastMessage(message);
        // Pub/sub: deliver to every subscriber without coalescing.
        dispatchMessage(message);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };
    setWs(newWebSocket);

    return () => {
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      newWebSocket.close();
    };
  }, [api, deviceId, isNetworkConnected, dispatchMessage]);

  const handleLibraryChanged = useCallback(
    (data: any) => {
      // Jellyfin sends LibraryChanged when a scan adds/updates/removes items.
      // Only refresh when something actually changed in the item set.
      const hasChanges =
        (data?.ItemsAdded?.length ?? 0) > 0 ||
        (data?.ItemsRemoved?.length ?? 0) > 0 ||
        (data?.ItemsUpdated?.length ?? 0) > 0 ||
        (data?.FoldersAddedTo?.length ?? 0) > 0 ||
        (data?.FoldersRemovedFrom?.length ?? 0) > 0;

      if (!hasChanges) {
        return;
      }

      refreshQueue.libraryChanged();
    },
    [refreshQueue],
  );

  const handleUserDataChanged = useCallback(
    (data: any) => {
      if (!((data?.UserDataList?.length ?? 0) > 0)) return;
      // Retain every affected item, including updates from other clients.
      // Remote play/pause/stop dispatch above continues immediately.
      const ids = data.UserDataList.map(
        (entry: { ItemId?: string }) => entry.ItemId,
      ).filter(
        (id: unknown): id is string => typeof id === "string" && id.length > 0,
      );
      refreshQueue.userDataChanged(ids);
    },
    [refreshQueue],
  );

  // Refresh library-dependent queries when the server reports a change.
  useEffect(
    () => subscribe("LibraryChanged", handleLibraryChanged),
    [subscribe, handleLibraryChanged],
  );

  // Refresh "Continue Watching" / "Next Up" when playback state changes.
  useEffect(
    () => subscribe("UserDataChanged", handleUserDataChanged),
    [subscribe, handleUserDataChanged],
  );

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // The server-initiated "Play me this item" command is handled by
  // NativePlayerProvider (mounted below this provider): it presents the
  // native player when active, and falls back to the JS player route.

  useEffect(() => {
    const cleanup = connectWebSocket();
    return cleanup;
  }, [connectWebSocket]);

  useEffect(() => {
    if (!deviceId || !api?.accessToken || !isNetworkConnected) {
      return;
    }

    const init = async () => {
      try {
        await getSessionApi(api).postFullCapabilities({
          clientCapabilitiesDto: {
            AppStoreUrl:
              "https://apps.apple.com/us/app/streamyfin/id6593660679",
            IconUrl:
              "https://raw.githubusercontent.com/streamyfin/streamyfin/refs/heads/develop/assets/images/streamyfin-client-badge.png",
            PlayableMediaTypes: ["Audio", "Video"],
            SupportedCommands: ["Play"],
            SupportsMediaControl: true,
            SupportsPersistentIdentifier: true,
          },
        });
      } catch {
        // Silently fail - expected when offline or server unreachable
      }
    };

    init();
  }, [api, deviceId, isNetworkConnected]);

  useEffect(() => {
    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        console.log("App moving to background, closing WebSocket...");
        ws?.close();
      } else if (state === "active") {
        console.log("App coming to foreground, reconnecting WebSocket...");
        connectWebSocket();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
      ws?.close();
    };
  }, [ws, connectWebSocket]);
  const sendMessage = useCallback(
    (message: any) => {
      if (ws && isConnected) {
        ws.send(JSON.stringify(message));
      }
      // Silently fail when not connected - expected when offline
    },
    [ws, isConnected],
  );
  const clearLastMessage = useCallback(() => {
    setLastMessage(null);
  }, []);
  return (
    <WebSocketContext.Provider
      value={{
        ws,
        isConnected,
        lastMessage,
        subscribe,
        sendMessage,
        clearLastMessage,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error(
      "useWebSocketContext must be used within a WebSocketProvider",
    );
  }
  return context;
};
