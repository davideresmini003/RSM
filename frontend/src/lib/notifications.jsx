import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

const STORAGE_KEY = "rsm_chat_read";

function getReadMap() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}

export function markChatRead(opId) {
  const map = getReadMap();
  map[opId] = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

const NotifCtx = createContext({ chat: 0, operations: 0, solicitudes: 0, interests: 0, refresh: () => {} });

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ chat: 0, operations: 0, solicitudes: 0, interests: 0 });
  const timerRef = useRef(null);

  const poll = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get("/notifications/unread");
      const readMap = getReadMap();
      // Filter chat_ops: only count ops where last message is newer than last read
      const unreadOps = (data.chat_ops || []).filter((o) => {
        const readAt = readMap[o.op_id];
        return !readAt || o.last_at > readAt;
      });
      const chatCount = unreadOps.reduce((sum, o) => sum + o.count, 0);
      setCounts({ ...data, chat: chatCount });
    } catch (_) {}
  }, [user]);

  useEffect(() => {
    if (!user) { setCounts({ chat: 0, operations: 0, solicitudes: 0, interests: 0 }); return; }
    poll();
    timerRef.current = setInterval(poll, 10000);
    return () => clearInterval(timerRef.current);
  }, [user, poll]);

  return <NotifCtx.Provider value={{ ...counts, refresh: poll }}>{children}</NotifCtx.Provider>;
}

export function useNotifications() {
  return useContext(NotifCtx);
}
