import { useEffect, useRef, useCallback } from "react";
import { useSoftieStore } from "../store/index.ts";
import type { WsMessage, SoftieEvent } from "../types.ts";
import { eventToNotification } from "../notifications/event-to-notification.ts";
import { randomId } from "../utils.ts";

const WS_URL =
  typeof window !== "undefined"
    ? `ws://${window.location.host}/ws`
    : "ws://localhost:3847/ws";

const RECONNECT_DELAY = 2000;

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setWsConnected, addActivity, addNotification, appendChatDelta, finishChatStream, setProjectState, setMilestoneQuestion } =
    useSoftieStore();

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      setWsConnected(true);
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    socket.onclose = () => {
      setWsConnected(false);
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
    };

    socket.onerror = () => {
      socket.close();
    };

    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as WsMessage;
        handleMessage(msg);
      } catch {
        // ignore
      }
    };
  }, []); // eslint-disable-line

  function handleMessage(msg: WsMessage) {
    if (msg.type === "connected") return;

    if (msg.type === "milestone:question") {
      setMilestoneQuestion(msg.question);
      addNotification({
        id: randomId(),
        title: "Milestone question",
        description: msg.question.slice(0, 120),
        severity: "warning",
        read: false,
        timestamp: msg.timestamp,
        sourceEventType: "milestone:question",
        action: { viewId: "dashboard" },
      });
      return;
    }

    if (msg.type === "event") {
      const event = msg.data as SoftieEvent;
      addActivity(event);

      const notification = eventToNotification(event);
      if (notification) addNotification(notification);

      // Handle specific events
      if (event.type === "chat:delta") {
        appendChatDelta(event.threadId, event.content);
      } else if (event.type === "chat:done") {
        finishChatStream(event.threadId);
      } else if (event.type === "file:changed") {
        // Reload state on file changes
        loadProjectState();
      } else if (event.type === "cost:update") {
        setProjectState({ progress: undefined });
        loadProjectState();
      } else if (event.type === "project:status") {
        loadProjectState();
      } else if (event.type === "phase:completed" || event.type === "phase:failed") {
        loadProjectState();
      }
    }
  }

  const loadProjectState = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) return;
      const data = await res.json();
      setProjectState({
        metadata: data.metadata,
        team: data.team,
        plan: data.plan,
        progress: data.progress,
        tasks: data.tasks || [],
        approvalState: data.approvalState,
        specs: data.specs || [],
        boardTasks: data.boardTasks || [],
        sprints: data.sprints || [],
        exists: data.exists,
      });
    } catch {
      // server not ready yet
    }
  }, [setProjectState]);

  const send = useCallback((msg: Record<string, unknown>) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    connect();
    loadProjectState();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect, loadProjectState]);

  return { send, loadProjectState };
}
