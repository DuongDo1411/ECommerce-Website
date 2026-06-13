"use client";

import React, { useState } from "react";
import { FaComments } from "react-icons/fa";
import ChatWindow from "./ChatWindow";

export default function ChatButton({
  vendorId,
  currentUserId,
  vendorName,
  vendorImage,
}: {
  vendorId: string;
  currentUserId: string;
  vendorName?: string;
  vendorImage?: string;
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!currentUserId || currentUserId === vendorId) return null;

  const openChat = async () => {
    setOpen(true);
    if (conversationId || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId }),
      });
      const data = await res.json();
      if (res.ok && data.conversation?._id) {
        setConversationId(data.conversation._id);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openChat}
        className="fixed bottom-5 right-5 z-40 flex h-14 items-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-bold text-white shadow-xl shadow-emerald-900/40 transition hover:bg-emerald-500"
      >
        <FaComments size={18} />
        Chat
      </button>

      {open && conversationId && (
        <ChatWindow
          conversationId={conversationId}
          currentUserId={currentUserId}
          title={vendorName || "Vendor chat"}
          avatarUrl={vendorImage}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
