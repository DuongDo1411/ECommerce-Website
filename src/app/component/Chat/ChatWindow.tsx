"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { FaArrowLeft, FaPaperPlane, FaTimes } from "react-icons/fa";
import { useDispatch } from "react-redux";
import { getSocket } from "@/lib/socket-client";
import {
  ChatConversation,
  setActiveConversation,
  setConversationUnread,
  upsertConversation,
} from "@/redux/chatSlice";
import type { AppDispatch } from "@/redux/store";
import ImageUploadButton from "./ImageUploadButton";
import MessageBubble, { ChatMessage } from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

function getDateSeparatorLabel(dateValue?: string) {
  if (!dateValue) return "";

  const date = new Date(dateValue);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return "Hôm nay";
  if (sameDay(date, yesterday)) return "Hôm qua";

  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function shouldShowDateSeparator(
  message: ChatMessage,
  previousMessage?: ChatMessage,
) {
  if (!message.createdAt) return false;
  if (!previousMessage?.createdAt) return true;

  return (
    new Date(message.createdAt).toDateString() !==
    new Date(previousMessage.createdAt).toDateString()
  );
}

export default function ChatWindow({
  conversationId,
  currentUserId,
  title = "Chat",
  avatarUrl,
  onClose,
  onBack,
  embedded = false,
}: {
  conversationId: string;
  currentUserId?: string;
  title?: string;
  avatarUrl?: string;
  onClose?: () => void;
  onBack?: () => void;
  embedded?: boolean;
}) {
  const { data: session } = useSession();
  const dispatch = useDispatch<AppDispatch>();
  const ownId = currentUserId ?? session?.user?.id;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const preservingScrollRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const latestScrollTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const forceLatestScrollUntilRef = useRef(0);
  const shouldStickToLatestRef = useRef(true);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "auto") => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = scrollRef.current;
        if (!container) return;
        container.scrollTo({
          top: container.scrollHeight,
          behavior,
        });
      });
    });
  }, []);

  const scheduleLatestScroll = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      latestScrollTimeoutsRef.current.forEach((timeoutId) =>
        clearTimeout(timeoutId),
      );
      latestScrollTimeoutsRef.current = [];
      forceLatestScrollUntilRef.current = Date.now() + 800;

      scrollToLatest(behavior);
      latestScrollTimeoutsRef.current = [80, 220, 500].map((delay) =>
        setTimeout(() => scrollToLatest("auto"), delay),
      );
    },
    [scrollToLatest],
  );

  const isNearLatest = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return true;

    return container.scrollHeight - container.scrollTop - container.clientHeight < 180;
  }, []);

  const handleMediaLoad = useCallback(() => {
    if (preservingScrollRef.current) return;
    if (Date.now() <= forceLatestScrollUntilRef.current || isNearLatest()) {
      scheduleLatestScroll("auto");
    }
  }, [isNearLatest, scheduleLatestScroll]);

  useEffect(
    () => () => {
      latestScrollTimeoutsRef.current.forEach((timeoutId) =>
        clearTimeout(timeoutId),
      );
    },
    [],
  );

  useEffect(() => {
    dispatch(setActiveConversation(conversationId));
    return () => {
      dispatch(setActiveConversation(null));
    };
  }, [conversationId, dispatch]);

  useEffect(() => {
    let cancelled = false;

    const markConversationRead = async () => {
      const readRes = await fetch(`/api/chat/conversations/${conversationId}/read`, {
        method: "PATCH",
      });
      const readData = await readRes.json();

      if (!cancelled && readRes.ok && readData.side) {
        dispatch(
          setConversationUnread({
            conversationId,
            side: readData.side,
            count: 0,
            currentUserId: ownId,
          }),
        );
      }
    };

    const loadMessages = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/chat/conversations/${conversationId}/messages?limit=30`,
        );
        const data = await res.json();
        if (!cancelled && res.ok) {
          setMessages(data.messages ?? []);
          setHasMore(Boolean(data.hasMore));
          shouldStickToLatestRef.current = true;
          scheduleLatestScroll("auto");
        }

        await markConversationRead();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [conversationId, dispatch, ownId, scheduleLatestScroll]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const appendMessage = ({
      message,
      conversation,
    }: {
      message: ChatMessage;
      conversation?: ChatConversation;
    }) => {
      const messageConversationId = String(message.conversation);
      if (messageConversationId !== conversationId) return;
      const senderId =
        typeof message.sender === "string" ? message.sender : message.sender?._id;
      const shouldAutoScroll =
        senderId === ownId || shouldStickToLatestRef.current;

      setMessages((prev) => {
        if (prev.some((item) => item._id === message._id)) return prev;
        return [...prev, message];
      });
      if (shouldAutoScroll) scheduleLatestScroll("smooth");

      if (conversation) {
        dispatch(upsertConversation({ conversation, currentUserId: ownId }));
      }

      if (typeof message.sender !== "string" && message.sender?._id !== ownId) {
        fetch(`/api/chat/conversations/${conversationId}/read`, {
          method: "PATCH",
        })
          .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
          .then(({ ok, data }) => {
            if (!ok || !data.side) return;
            dispatch(
              setConversationUnread({
                conversationId,
                side: data.side,
                count: 0,
                currentUserId: ownId,
              }),
            );
          });
      }
    };

    const handleTypingStart = ({ conversationId: eventConversationId }: { conversationId: string }) => {
      if (eventConversationId === conversationId) setTyping(true);
    };

    const handleTypingStop = ({ conversationId: eventConversationId }: { conversationId: string }) => {
      if (eventConversationId === conversationId) setTyping(false);
    };

    const handleMessagesRead = ({
      conversationId: eventConversationId,
      readerId,
      readAt,
    }: {
      conversationId: string;
      readerId: string;
      readAt: string;
    }) => {
      if (eventConversationId !== conversationId) return;
      if (readerId === ownId) return;

      setMessages((prev) =>
        prev.map((message) =>
          message.sender === ownId ||
          (typeof message.sender !== "string" && message.sender?._id === ownId)
            ? { ...message, readAt }
            : message,
        ),
      );
    };

    socket.emit("join_conversation", { conversationId });
    socket.on("new_message", appendMessage);
    socket.on("typing_start", handleTypingStart);
    socket.on("typing_stop", handleTypingStop);
    socket.on("messages_read", handleMessagesRead);

    return () => {
      socket.off("new_message", appendMessage);
      socket.off("typing_start", handleTypingStart);
      socket.off("typing_stop", handleTypingStop);
      socket.off("messages_read", handleMessagesRead);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isTypingRef.current) {
        socket.emit("typing_stop", { conversationId });
        isTypingRef.current = false;
      }
      socket.emit("leave_conversation", { conversationId });
    };
  }, [conversationId, dispatch, ownId, scheduleLatestScroll]);

  useLayoutEffect(() => {
    if (!loading && !preservingScrollRef.current && shouldStickToLatestRef.current) {
      scheduleLatestScroll(messages.length <= 30 ? "auto" : "smooth");
    }
  }, [loading, messages.length, scheduleLatestScroll, typing]);

  const emitTyping = () => {
    const socket = getSocket();

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit("typing_start", { conversationId });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit("typing_stop", { conversationId });
    }, 900);
  };

  const loadOlderMessages = async () => {
    if (loadingMoreRef.current || loadingMore || !hasMore || messages.length === 0) {
      return;
    }

    const container = scrollRef.current;
    const oldestMessage = messages[0];
    if (!container || !oldestMessage?._id) return;

    const previousScrollHeight = container.scrollHeight;
    preservingScrollRef.current = true;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    let scheduledScrollRestore = false;
    try {
      const res = await fetch(
        `/api/chat/conversations/${conversationId}/messages?limit=30&before=${oldestMessage._id}`,
      );
      const data = await res.json();

      if (res.ok) {
        const olderMessages: ChatMessage[] = data.messages ?? [];
        setMessages((prev) => {
          const existingIds = new Set(prev.map((message) => message._id));
          const uniqueOlder = olderMessages.filter(
            (message) => !existingIds.has(message._id),
          );
          return [...uniqueOlder, ...prev];
        });
        setHasMore(Boolean(data.hasMore));

        scheduledScrollRestore = true;
        requestAnimationFrame(() => {
          if (!scrollRef.current) {
            preservingScrollRef.current = false;
            return;
          }
          const nextScrollHeight = scrollRef.current.scrollHeight;
          scrollRef.current.scrollTop =
            nextScrollHeight - previousScrollHeight + scrollRef.current.scrollTop;
          preservingScrollRef.current = false;
        });
      }
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
      if (!scheduledScrollRestore) {
        preservingScrollRef.current = false;
      }
    }
  };

  const handleScroll = () => {
    const container = scrollRef.current;
    shouldStickToLatestRef.current = isNearLatest();
    if (!container || container.scrollTop > 64) return;
    loadOlderMessages();
  };

  const sendMessage = async (type: "text" | "image", content: string) => {
    if (!content.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content }),
      });
      const data = await res.json();

      if (res.ok && data.message) {
        shouldStickToLatestRef.current = true;
        setMessages((prev) => {
          if (prev.some((item) => item._id === data.message._id)) return prev;
          return [...prev, data.message];
        });
        scheduleLatestScroll("smooth");
        if (data.conversation) {
          dispatch(
            upsertConversation({
              conversation: data.conversation,
              currentUserId: ownId,
            }),
          );
        }
      }
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;

    setInput("");
    await sendMessage("text", text);
    isTypingRef.current = false;
    getSocket().emit("typing_stop", { conversationId });
  };

  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    emitTyping();

  };

  const handleTextKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();

    if (input.trim() && !sending) {
      event.currentTarget.form?.requestSubmit();
    }
  };

  const shellClass = embedded
    ? "flex h-full min-h-0 flex-col overflow-hidden bg-[#0b0f17]"
    : "fixed bottom-5 right-5 z-50 flex h-[560px] w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-gray-950 text-white shadow-2xl shadow-black/50";

  return (
    <div className={shellClass}>
      <div className="relative flex h-16 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#101827] px-5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-emerald-400/[0.06] via-transparent to-transparent" />
        <div className="relative flex min-w-0 items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="relative mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-gray-300 transition hover:bg-white/[0.08] hover:text-white md:hidden"
              aria-label="Back to conversations"
            >
              <FaArrowLeft size={15} />
            </button>
          )}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-400/20 bg-emerald-400/10 text-sm font-bold text-emerald-300">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={title}
                className="h-full w-full object-cover"
              />
            ) : (
              title[0]?.toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{title}</p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="relative grid h-9 w-9 place-items-center rounded-xl text-gray-300 transition hover:bg-white/[0.08] hover:text-white"
            title="Đóng"
          >
            <FaTimes size={14} />
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="chat-scroll flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.26),transparent_28%)] px-4 py-5"
      >
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-gray-500">
            <div className="flex gap-1.5">
              <span className="typing-dot inline-block h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
              <span className="typing-dot inline-block h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
              <span className="typing-dot inline-block h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
            </div>
            <span>Đang tải tin nhắn...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="msg-fade-in-up flex h-full flex-col items-center justify-center text-center text-sm text-gray-500">
            <div className="mb-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 text-emerald-400/50">
              <FaPaperPlane size={30} />
            </div>
            <p className="font-medium text-gray-300">Hãy bắt đầu cuộc trò chuyện</p>
            <p className="mt-1 text-xs text-gray-600">Gửi tin nhắn đầu tiên</p>
          </div>
        ) : (
          <div className="space-y-3">
            {loadingMore && (
              <div className="flex justify-center py-1 text-xs text-gray-500">
                <span className="rounded-full border border-white/[0.06] bg-white/[0.04] px-3 py-1">
                  Đang tải tin nhắn cũ...
                </span>
              </div>
            )}
            {messages.map((message, index) => (
              <React.Fragment key={message._id}>
                {shouldShowDateSeparator(message, messages[index - 1]) && (
                  <div className="msg-fade-in-up flex justify-center py-2">
                    <span className="rounded-full border border-white/[0.06] bg-white/[0.05] px-3 py-1 text-[11px] font-semibold text-gray-400">
                      {getDateSeparatorLabel(message.createdAt)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={message}
                  currentUserId={ownId}
                  onMediaLoad={handleMediaLoad}
                />
              </React.Fragment>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <TypingIndicator show={typing} />

      <form
        onSubmit={handleSubmit}
        className="flex h-16 shrink-0 items-center gap-2.5 border-t border-white/[0.07] bg-[#101827] px-3"
      >
        <ImageUploadButton
          disabled={sending}
          onUploaded={(url) => sendMessage("image", url)}
        />
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleTextChange}
          onKeyDown={handleTextKeyDown}
          maxLength={2000}
          placeholder="Nhập tin nhắn..."
          rows={1}
          className="h-10 min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border border-white/[0.09] bg-white/[0.05] px-4 py-2.5 text-sm leading-5 text-white outline-none transition placeholder:text-gray-500 focus:border-emerald-400/50 focus:bg-white/[0.07]"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500 disabled:shadow-none"
          title="Gửi"
        >
          <FaPaperPlane size={15} />
        </button>
      </form>
    </div>
  );
}
