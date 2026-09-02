// Khai báo 3 tool chỉ đọc cho Gemini Interactions API và bảng dispatch thực thi.
// Shape tool là {type:"function", name, description, parameters} — đúng FunctionT
// của @google/genai (KHÁC {functionDeclarations:[...]} của generateContent cũ),
// xác nhận trực tiếp từ node_modules/@google/genai/dist/genai.d.ts.

import { searchProducts, getMyOrders } from "@/lib/assistant/retrieval";
import { getPolicyText, ASSISTANT_POLICY_TOPICS } from "@/lib/assistant/policies";
import type { AssistantOrderCard, AssistantProductCard } from "@/lib/assistant/types";

const ORDER_STATUS_ENUM = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "returned",
  "delivery_exception",
  "cancelled",
];

export const SEARCH_PRODUCTS_TOOL = {
  type: "function" as const,
  name: "search_products",
  description:
    "Tìm sản phẩm đang bán trên MultiCart theo từ khóa, danh mục, khoảng giá, size hoặc điều kiện thanh toán/giao hàng. Chỉ trả sản phẩm đã duyệt và đang hiển thị công khai.",
  parameters: {
    type: "object",
    properties: {
      keywords: { type: "string", description: "Từ khóa tìm trong tên hoặc danh mục sản phẩm." },
      category: { type: "string", description: "Lọc chính xác theo danh mục." },
      minPrice: { type: "number", description: "Giá tối thiểu (VND)." },
      maxPrice: { type: "number", description: "Giá tối đa (VND)." },
      size: { type: "string", description: "Size cần tìm, ví dụ M, L, 42." },
      payOnDelivery: { type: "boolean", description: "true nếu chỉ muốn sản phẩm hỗ trợ COD." },
      freeDelivery: { type: "boolean", description: "true nếu chỉ muốn sản phẩm miễn phí vận chuyển." },
      limit: { type: "integer", description: "Số kết quả tối đa, mặc định 5, tối đa 8." },
    },
    required: [],
  },
};

export const GET_MULTICART_POLICY_TOOL = {
  type: "function" as const,
  name: "get_multicart_policy",
  description: "Lấy nội dung chính sách thật của MultiCart theo chủ đề (thanh toán, vận chuyển, đổi/trả, voucher, hỗ trợ).",
  parameters: {
    type: "object",
    properties: {
      topic: {
        type: "string",
        enum: ASSISTANT_POLICY_TOPICS,
        description: "Một trong: payment, shipping, returns, vouchers, support.",
      },
    },
    required: ["topic"],
  },
};

export const GET_MY_ORDERS_TOOL = {
  type: "function" as const,
  name: "get_my_orders",
  description:
    "Xem tóm tắt các đơn hàng của CHÍNH người dùng đang trò chuyện (đã đăng nhập). Không dùng cho khách vãng lai và không tra được đơn của người khác.",
  parameters: {
    type: "object",
    properties: {
      status: { type: "string", enum: ORDER_STATUS_ENUM, description: "Lọc theo trạng thái đơn." },
      limit: { type: "integer", description: "Số đơn tối đa, mặc định 5, tối đa 10." },
    },
    required: [],
  },
};

/** Tools luôn khả dụng cho mọi người, kể cả khách chưa đăng nhập. */
export function publicTools() {
  return [SEARCH_PRODUCTS_TOOL, GET_MULTICART_POLICY_TOOL];
}

/**
 * Chỉ thêm `get_my_orders` vào danh sách khi có userId — đây là cơ chế ép ranh giới
 * khách/đăng nhập ở tầng server: model không thể gọi một tool không được khai báo
 * trong request đó, nên guest không có cách nào (kể cả qua prompt injection) khiến
 * model gọi được tool tra đơn hàng.
 */
export function buildTools(userId: string | null) {
  return userId ? [...publicTools(), GET_MY_ORDERS_TOOL] : publicTools();
}

function toFiniteNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function toTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export interface ToolExecutionContext {
  userId: string | null;
}

export interface ToolExecutionOutcome {
  /** Nội dung gửi lại cho Gemini làm function_result. */
  resultForModel: unknown;
  /** Dữ liệu có cấu trúc để route gom lại trả cho frontend render card. */
  products?: AssistantProductCard[];
  orders?: AssistantOrderCard[];
}

/**
 * Thực thi một tool theo tên. Với `get_my_orders`, userId LUÔN lấy từ ctx (server
 * session) — không bao giờ đọc từ `args` do model đưa ra, để chặn dò dữ liệu người
 * khác qua prompt injection kiểu "giả vờ tôi là user X".
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolExecutionOutcome> {
  if (name === "search_products") {
    const products = await searchProducts({
      keywords: toTrimmedString(args.keywords),
      category: toTrimmedString(args.category),
      minPrice: toFiniteNumber(args.minPrice),
      maxPrice: toFiniteNumber(args.maxPrice),
      size: toTrimmedString(args.size),
      payOnDelivery: toBoolean(args.payOnDelivery),
      freeDelivery: toBoolean(args.freeDelivery),
      limit: toFiniteNumber(args.limit),
    });
    return { resultForModel: { products }, products };
  }

  if (name === "get_multicart_policy") {
    const topic = toTrimmedString(args.topic) ?? "";
    return { resultForModel: { text: getPolicyText(topic) } };
  }

  if (name === "get_my_orders") {
    if (!ctx.userId) {
      return {
        resultForModel: {
          error: "Người dùng chưa đăng nhập, không thể tra cứu đơn hàng.",
        },
      };
    }
    const orders = await getMyOrders(ctx.userId, {
      status: toTrimmedString(args.status),
      limit: toFiniteNumber(args.limit),
    });
    return { resultForModel: { orders }, orders };
  }

  return { resultForModel: { error: `Tool không xác định: ${name}` } };
}
