import { noStoreJson } from "@/lib/security/response";

/**
 * Health check cho nền tảng hosting. Render gọi đường dẫn này định kỳ và KHỞI ĐỘNG LẠI service
 * khi nó không trả lời — nên endpoint này phải trả lời được cả lúc mọi thứ khác đã hỏng.
 *
 * Cố ý KHÔNG chạm database. Đây là quyết định thiết kế, không phải chỗ viết thiếu: health check
 * thất bại thì Render restart tiến trình, mà restart không chữa được một Atlas đang gián đoạn.
 * Nó chỉ biến một sự cố ở phía phụ thuộc thành vòng lặp khởi động lại, và làm mất luôn phần
 * chức năng vốn vẫn chạy được.
 *
 * Câu hỏi endpoint này trả lời là "tiến trình còn nhận và xử lý được request không" — đúng thứ
 * mà một event loop bị treo hay lần exit 137 hôm 03/08/2026 làm sai. Không phải câu hỏi "mọi
 * phụ thuộc còn sống không"; cái đó thuộc việc theo dõi, không thuộc việc quyết định restart.
 *
 * Không khai cấu hình segment vì route handler ở Next 16 không được cache theo mặc định. Vẫn
 * đặt `no-store` để không thành phần trung gian nào tự ý giữ lại câu trả lời.
 */
export function GET() {
  return noStoreJson({ ok: true });
}
