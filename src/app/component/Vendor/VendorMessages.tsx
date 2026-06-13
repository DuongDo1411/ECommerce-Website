"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { FaSearch } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";
import ChatWindow from "@/app/component/Chat/ChatWindow";
import ConversationList from "@/app/component/Chat/ConversationList";
import {
  ChatConversation,
  setConversationUnread,
  setConversations,
} from "@/redux/chatSlice";
import type { AppDispatch, RootState } from "@/redux/store";

export default function VendorMessages() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const dispatch = useDispatch<AppDispatch>();
  const conversations = useSelector(
    (state: RootState) => state.chat.conversations,
  );
  const [selected, setSelected] = useState<ChatConversation | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    if (!currentUserId || conversations.length > 0) return;

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

  const activeConversation =
    conversations.find((item) => item._id === selected?._id) ??
    selected ??
    autoSelectedConversation;

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
    activeConversation?.buyer?._id === currentUserId
      ? activeConversation?.vendor
      : activeConversation?.buyer;

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
    setSelected(conversation);
    setMobileView("chat");
  };

  const handleMobileBack = () => setMobileView("list");

  useEffect(() => {
    if (!currentUserId || selected || !autoSelectedConversation) return;

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
  }, [autoSelectedConversation, currentUserId, dispatch, selected]);

  return (
    <div className="h-[calc(100dvh-7rem)] overflow-hidden rounded-2xl border border-white/10 bg-white/5 sm:h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-5rem)]">
      <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[320px_1fr]">
        <div
          className={`min-h-0 flex-col border-r border-white/10 bg-black/20 md:flex ${
            mobileView === "chat" ? "hidden" : "flex"
          }`}
        >
          <div className="border-b border-white/10 px-4 py-4">
            <h2 className="text-lg font-bold text-white">Messages</h2>
            <p className="mt-1 text-xs text-gray-400">
              Quản lý trò chuyện với khách hàng
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <FaSearch size={13} className="shrink-0 text-gray-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm cuộc trò chuyện..."
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 rounded-xl bg-white/5 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-lg px-3 py-2 transition ${
                  filter === "all"
                    ? "bg-emerald-600 text-white"
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
                    ? "bg-emerald-600 text-white"
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
            selectedConversationId={activeConversation?._id}
            onSelect={handleSelect}
          />
        </div>

        <div
          className={`min-h-0 flex-col md:flex ${
            mobileView === "chat" ? "flex" : "hidden"
          }`}
        >
          {activeConversation ? (
            <div className="min-h-0 flex-1">
              <ChatWindow
                conversationId={activeConversation._id}
                currentUserId={currentUserId}
                title={other?.shopName || other?.name || "Chat"}
                avatarUrl={other?.image}
                onBack={handleMobileBack}
                embedded
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              Chọn một cuộc trò chuyện
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
