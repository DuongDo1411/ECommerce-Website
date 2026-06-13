"use client";

import React, { useEffect, useMemo, useState } from "react";
import { FaComments, FaSearch } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";
import ChatWindow from "@/app/component/Chat/ChatWindow";
import ConversationList from "@/app/component/Chat/ConversationList";
import {
  ChatConversation,
  setConversationUnread,
  setConversations,
} from "@/redux/chatSlice";
import type { AppDispatch, RootState } from "@/redux/store";

export default function MessagesClient({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const conversations = useSelector(
    (state: RootState) => state.chat.conversations,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    if (conversations.length > 0) return;

    const loadConversations = async () => {
      const res = await fetch("/api/chat/conversations");
      const data = await res.json();

      if (res.ok) {
        dispatch(
          setConversations({
            conversations: data.conversations ?? [],
            currentUserId,
          }),
        );
      }
    };

    loadConversations();
  }, [conversations.length, currentUserId, dispatch]);

  const autoSelectedConversation = useMemo(
    () =>
      conversations.find((conversation) =>
        conversation.buyer?._id === currentUserId
          ? conversation.buyerUnread > 0
          : conversation.vendorUnread > 0,
      ) ??
      conversations[0] ??
      null,
    [conversations, currentUserId],
  );

  const selectedConversation = useMemo(
    () => {
      if (selectedId === "__none__") return null;
      return (
        conversations.find((item) => item._id === selectedId) ??
        (!selectedId ? autoSelectedConversation : null)
      );
    },
    [autoSelectedConversation, conversations, selectedId],
  );

  const filteredConversations = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return conversations.filter((conversation) => {
      const unread =
        conversation.buyer?._id === currentUserId
          ? conversation.buyerUnread
          : conversation.vendorUnread;

      if (filter === "unread" && unread <= 0) return false;
      if (!keyword) return true;

      const other =
        conversation.buyer?._id === currentUserId
          ? conversation.vendor
          : conversation.buyer;

      return [
        other?.shopName,
        other?.name,
        other?.email,
        conversation.lastMessagePreview,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(keyword));
    });
  }, [conversations, currentUserId, filter, search]);

  const other =
    selectedConversation?.buyer?._id === currentUserId
      ? selectedConversation?.vendor
      : selectedConversation?.buyer;

  const handleSelect = (conversation: ChatConversation) => {
    const side = conversation.buyer?._id === currentUserId ? "buyer" : "vendor";
    dispatch(
      setConversationUnread({
        conversationId: conversation._id,
        side,
        count: 0,
        currentUserId,
      }),
    );
    setSelectedId(conversation._id);
  };

  useEffect(() => {
    if (selectedId || !autoSelectedConversation) return;

    const unread =
      autoSelectedConversation.buyer?._id === currentUserId
        ? autoSelectedConversation.buyerUnread
        : autoSelectedConversation.vendorUnread;

    if (unread > 0) {
      const side =
        autoSelectedConversation.buyer?._id === currentUserId
          ? "buyer"
          : "vendor";
      dispatch(
        setConversationUnread({
          conversationId: autoSelectedConversation._id,
          side,
          count: 0,
          currentUserId,
        }),
      );
    }
  }, [autoSelectedConversation, currentUserId, dispatch, selectedId]);

  const totalUnread = conversations.reduce((sum, conversation) => {
    const unread =
      conversation.buyer?._id === currentUserId
        ? conversation.buyerUnread
        : conversation.vendorUnread;

    return sum + unread;
  }, 0);

  return (
    <section className="mx-auto flex h-[calc(100vh-5rem)] max-w-7xl flex-col px-4 py-5 md:px-6">
      <div className="msg-fade-in-up mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/10 text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.12)]">
            <FaComments size={18} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white">Tin nhắn</h1>
            <p className="mt-0.5 text-xs text-gray-400">
              Theo dõi và phản hồi các cuộc trò chuyện với vendor.
            </p>
          </div>
        </div>
        {totalUnread > 0 && (
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            {totalUnread} chưa đọc
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#090d14]/95 shadow-2xl shadow-black/40 ring-1 ring-white/[0.03] backdrop-blur-sm">
        <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[360px_1fr]">
          <div
            className={`min-h-0 flex-col overflow-hidden border-white/[0.07] bg-[#070a0f]/95 md:flex md:border-r ${
              selectedConversation ? "hidden" : "block"
            }`}
          >
            <div className="shrink-0 border-b border-white/[0.07] px-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Cuộc trò chuyện
                  </h2>
                  <p className="mt-1 text-xs text-gray-400">
                    Chọn một vendor để tiếp tục nhắn tin.
                  </p>
                </div>
                <span className="rounded-full border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                  {filteredConversations.length}
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 transition focus-within:border-emerald-400/40 focus-within:bg-white/[0.06]">
                <FaSearch size={13} className="shrink-0 text-gray-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm cuộc trò chuyện..."
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
                />
              </div>
              <div className="mt-3 grid grid-cols-2 rounded-xl border border-white/[0.05] bg-white/[0.03] p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={`rounded-lg px-3 py-2 transition ${
                    filter === "all"
                      ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("unread")}
                  className={`rounded-lg px-3 py-2 transition ${
                    filter === "unread"
                      ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Chưa đọc
                </button>
              </div>
            </div>
            <ConversationList
              conversations={filteredConversations}
              currentUserId={currentUserId}
              selectedConversationId={selectedConversation?._id}
              onSelect={handleSelect}
            />
          </div>

          <div
            className={`min-h-0 ${
              selectedConversation ? "block" : "hidden md:block"
            }`}
          >
            {selectedConversation ? (
              <ChatWindow
                conversationId={selectedConversation._id}
                currentUserId={currentUserId}
                title={other?.shopName || other?.name || "Chat"}
                avatarUrl={other?.image}
                onClose={() => setSelectedId("__none__")}
                embedded
              />
            ) : (
              <div className="msg-fade-in-up flex h-full min-h-0 flex-col items-center justify-center text-center text-gray-500">
                <div className="mb-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
                  <FaComments size={38} className="text-emerald-400/50" />
                </div>
                <p className="text-sm font-semibold text-gray-300">Chọn một cuộc trò chuyện để bắt đầu</p>
                <p className="mt-1 text-xs text-gray-600">Tin nhắn sẽ hiển thị ở khu vực này.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
