// Kiểu dùng chung cho trợ lý AI mua sắm (src/lib/assistant/**).
// Tách khỏi kiểu của hệ thống chat buyer-vendor (Conversation/Message) có chủ đích —
// hai hệ thống không chia sẻ dữ liệu hay model.

export class AssistantError extends Error {
  status: number;
  retryAfterSeconds?: number;
  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "AssistantError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type AssistantRole = "user" | "assistant";

export interface AssistantMessage {
  role: AssistantRole;
  content: string;
}

export interface AssistantProductCard {
  id: string;
  title: string;
  price: number;
  image: string | null;
  category: string;
  shopName: string;
  inStock: boolean;
  payOnDelivery: boolean;
  freeDelivery: boolean;
  replacementDays: number | null;
  availableSizes: Array<{ size: string; stock: number }>;
  warranty: string | null;
  url: string;
}

export interface AssistantOrderCard {
  id: string;
  statusLabel: string;
  totalAmount: number;
  createdAt: string;
  paymentMethod: "cod" | "vnpay";
  isPaid: boolean;
  productTitles: string[];
  ghnStatus: string | null;
  returnStatus: string | null;
}

export interface AssistantChatRequest {
  message: string;
  history?: AssistantMessage[];
}

export interface AssistantChatResult {
  reply: string;
  products: AssistantProductCard[];
  orders: AssistantOrderCard[];
}
