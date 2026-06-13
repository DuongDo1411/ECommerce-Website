"use client";

import React, { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useDispatch } from "react-redux";
import { getSocket, disconnectSocket } from "@/lib/socket-client";
import {
  setConversationUnread,
  setConversations,
  upsertConversation,
  ChatConversation,
} from "@/redux/chatSlice";
import type { AppDispatch } from "@/redux/store";

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const dispatch = useDispatch<AppDispatch>();
  const currentUserId = session?.user?.id;

  useEffect(() => {
    if (status !== "authenticated" || !currentUserId) {
      disconnectSocket();
      return;
    }

    let cancelled = false;
    const socket = getSocket();

    const loadConversations = async () => {
      try {
        const res = await fetch("/api/chat/conversations");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          dispatch(
            setConversations({
              conversations: data.conversations ?? [],
              currentUserId,
            }),
          );
        }
      } catch {
        // The chat provider should not break the rest of the app.
      }
    };

    const handleConversationUpdated = ({
      conversation,
    }: {
      conversation: ChatConversation;
    }) => {
      dispatch(upsertConversation({ conversation, currentUserId }));
    };

    const handleUnreadUpdate = ({
      conversationId,
      side,
      count,
    }: {
      conversationId: string;
      side: "buyer" | "vendor";
      count: number;
    }) => {
      dispatch(
        setConversationUnread({ conversationId, side, count, currentUserId }),
      );
    };

    loadConversations();

    socket.connect();
    socket.on("conversation_updated", handleConversationUpdated);
    socket.on("unread_update", handleUnreadUpdate);

    return () => {
      cancelled = true;
      socket.off("conversation_updated", handleConversationUpdated);
      socket.off("unread_update", handleUnreadUpdate);
    };
  }, [currentUserId, dispatch, status]);

  return <>{children}</>;
}
