import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ChatUser {
  _id: string;
  name?: string;
  email?: string;
  image?: string;
  shopName?: string;
}

export interface ChatConversation {
  _id: string;
  buyer: ChatUser;
  vendor: ChatUser;
  lastMessagePreview?: string;
  lastMessageType?: "text" | "image";
  lastMessageSender?: ChatUser | string;
  lastMessageAt?: string;
  buyerUnread: number;
  vendorUnread: number;
  updatedAt?: string;
}

interface ChatState {
  totalUnread: number;
  conversations: ChatConversation[];
  activeConversationId: string | null;
}

const initialState: ChatState = {
  totalUnread: 0,
  conversations: [],
  activeConversationId: null,
};

function sortConversations(conversations: ChatConversation[]) {
  return conversations.sort((a, b) => {
    const aTime = new Date(a.lastMessageAt ?? a.updatedAt ?? 0).getTime();
    const bTime = new Date(b.lastMessageAt ?? b.updatedAt ?? 0).getTime();
    return bTime - aTime;
  });
}

function calculateTotalUnread(
  conversations: ChatConversation[],
  currentUserId?: string,
) {
  if (!currentUserId) return 0;

  return conversations.reduce((total, conversation) => {
    if (conversation.buyer?._id === currentUserId) {
      return total + (conversation.buyerUnread ?? 0);
    }
    if (conversation.vendor?._id === currentUserId) {
      return total + (conversation.vendorUnread ?? 0);
    }
    return total;
  }, 0);
}

function clearActiveConversationUnread(
  conversation: ChatConversation,
  currentUserId?: string,
) {
  if (!currentUserId) return;

  if (conversation.buyer?._id === currentUserId) {
    conversation.buyerUnread = 0;
  } else if (conversation.vendor?._id === currentUserId) {
    conversation.vendorUnread = 0;
  }
}

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setConversations(
      state,
      action: PayloadAction<{
        conversations: ChatConversation[];
        currentUserId?: string;
      }>,
    ) {
      state.conversations = action.payload.conversations.map((conversation) => {
        if (conversation._id === state.activeConversationId) {
          clearActiveConversationUnread(
            conversation,
            action.payload.currentUserId,
          );
        }
        return conversation;
      });
      state.conversations = sortConversations(state.conversations);
      state.totalUnread = calculateTotalUnread(
        state.conversations,
        action.payload.currentUserId,
      );
    },
    upsertConversation(
      state,
      action: PayloadAction<{
        conversation: ChatConversation;
        currentUserId?: string;
      }>,
    ) {
      const index = state.conversations.findIndex(
        (item) => item._id === action.payload.conversation._id,
      );

      if (index >= 0) {
        state.conversations[index] = action.payload.conversation;
      } else {
        state.conversations.unshift(action.payload.conversation);
      }

      const conversation =
        state.conversations.find(
          (item) => item._id === action.payload.conversation._id,
        ) ?? action.payload.conversation;

      if (conversation._id === state.activeConversationId) {
        clearActiveConversationUnread(
          conversation,
          action.payload.currentUserId,
        );
      }

      state.conversations = sortConversations(state.conversations);
      state.totalUnread = calculateTotalUnread(
        state.conversations,
        action.payload.currentUserId,
      );
    },
    setConversationUnread(
      state,
      action: PayloadAction<{
        conversationId: string;
        side: "buyer" | "vendor";
        count: number;
        currentUserId?: string;
      }>,
    ) {
      const conversation = state.conversations.find(
        (item) => item._id === action.payload.conversationId,
      );

      if (conversation) {
        const nextCount =
          action.payload.conversationId === state.activeConversationId &&
          action.payload.count > 0
            ? 0
            : action.payload.count;

        if (action.payload.side === "buyer") {
          conversation.buyerUnread = nextCount;
        } else {
          conversation.vendorUnread = nextCount;
        }
      }

      state.totalUnread = calculateTotalUnread(
        state.conversations,
        action.payload.currentUserId,
      );
    },
    setActiveConversation(state, action: PayloadAction<string | null>) {
      state.activeConversationId = action.payload;
    },
  },
});

export const {
  setActiveConversation,
  setConversationUnread,
  setConversations,
  upsertConversation,
} = chatSlice.actions;

export default chatSlice.reducer;
