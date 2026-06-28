"use client";

import React from "react";
import Image from "next/image";
import { FaComments } from "react-icons/fa";
import { ChatConversation } from "@/redux/chatSlice";

function getOtherUser(conversation: ChatConversation, currentUserId?: string) {
  if (conversation.buyer?._id === currentUserId) return conversation.vendor;
  return conversation.buyer;
}

function getUnread(conversation: ChatConversation, currentUserId?: string) {
  if (conversation.buyer?._id === currentUserId) return conversation.buyerUnread;
  if (conversation.vendor?._id === currentUserId) return conversation.vendorUnread;
  return 0;
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return "";

  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins}ph`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;

  return `${Math.floor(hrs / 24)}d`;
}

export default function ConversationList({
  conversations,
  currentUserId,
  selectedConversationId,
  onSelect,
}: {
  conversations: ChatConversation[];
  currentUserId?: string;
  selectedConversationId?: string | null;
  onSelect: (conversation: ChatConversation) => void;
}) {
  if (conversations.length === 0) {
    return (
      <div className="msg-fade-in-up flex h-full min-h-60 flex-col items-center justify-center px-6 text-center text-gray-500">
        <div className="mb-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
          <FaComments size={32} className="text-emerald-400/40" />
        </div>
        <p className="text-sm font-medium text-gray-400">
          Chưa có cuộc trò chuyện nào
        </p>
        <p className="mt-1 text-xs text-gray-600">
          Hãy bắt đầu nhắn tin với vendor
        </p>
      </div>
    );
  }

  return (
    <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
      {conversations.map((conversation, index) => {
        const other = getOtherUser(conversation, currentUserId);
        const unread = getUnread(conversation, currentUserId);
        const active = selectedConversationId === conversation._id;
        const initial = (other?.shopName || other?.name || "C")[0].toUpperCase();

        return (
          <button
            key={conversation._id}
            type="button"
            onClick={() => onSelect(conversation)}
            style={{ animationDelay: `${index * 35}ms` }}
            className={`msg-fade-in-up group flex w-full items-center gap-3 border-b border-white/[0.04] border-l-2 px-4 py-3.5 text-left transition-all duration-200 ${
              active
                ? "border-l-emerald-400 bg-emerald-500/[0.12]"
                : "border-l-transparent hover:bg-white/[0.04]"
            }`}
          >
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gray-800 ring-2 ring-white/10 transition group-hover:ring-white/25">
              {other?.image ? (
                <Image
                  src={other.image}
                  alt={other.shopName || other.name || "avatar"}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-500/30 to-blue-500/30 text-sm font-bold text-white">
                  {initial}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p
                  className={`truncate text-sm font-semibold ${
                    unread > 0 ? "text-white" : "text-gray-200"
                  }`}
                >
                  {other?.shopName || other?.name || "Conversation"}
                </p>
                <span className="shrink-0 text-[10px] font-medium text-gray-500">
                  {timeAgo(conversation.lastMessageAt)}
                </span>
              </div>

              <div className="mt-1 flex items-center gap-2">
                <p
                  className={`truncate text-xs ${
                    unread > 0 ? "font-medium text-gray-300" : "text-gray-500"
                  }`}
                >
                  {conversation.lastMessagePreview || "Bắt đầu trò chuyện"}
                </p>
                {unread > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-lg shadow-red-500/30">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
