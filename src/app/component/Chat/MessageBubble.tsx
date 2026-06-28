"use client";

import React from "react";
import Image from "next/image";
import { FaCheck, FaCheckDouble } from "react-icons/fa";

export interface ChatMessage {
  _id: string;
  conversation: string;
  sender:
    | string
    | {
        _id: string;
        name?: string;
        image?: string;
        shopName?: string;
      };
  senderSide: "buyer" | "vendor";
  type: "text" | "image";
  content: string;
  readAt?: string | null;
  createdAt?: string;
}

function getSenderId(sender: ChatMessage["sender"]) {
  return typeof sender === "string" ? sender : sender?._id;
}

export default function MessageBubble({
  message,
  currentUserId,
  onMediaLoad,
}: {
  message: ChatMessage;
  currentUserId?: string;
  onMediaLoad?: () => void;
}) {
  const mine = getSenderId(message.sender) === currentUserId;
  const createdAt = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className={`msg-fade-in-up flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
        <div
          className={`overflow-hidden rounded-2xl px-3.5 py-2.5 text-sm shadow-lg ${
            mine
              ? "rounded-br-md bg-emerald-500 text-white shadow-emerald-500/10"
              : "rounded-bl-md border border-white/[0.06] bg-white/[0.10] text-gray-100 shadow-black/10"
          }`}
        >
          {message.type === "image" ? (
            <a href={message.content} target="_blank" rel="noreferrer">
              <Image
                src={message.content}
                alt="Chat upload"
                width={320}
                height={240}
                className="h-auto max-h-64 max-w-full rounded-xl object-contain"
                onLoad={onMediaLoad}
              />
            </a>
          ) : (
            <p className="whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
          )}
        </div>

        {mine && (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
            {createdAt && <span>{createdAt}</span>}
            {message.readAt ? (
              <>
                <FaCheckDouble size={10} className="text-emerald-400" />
                <span>Đã xem</span>
              </>
            ) : (
              <>
                <FaCheck size={10} />
                <span>Đã gửi</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
